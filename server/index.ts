import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./api.js";
import { originGuard } from "./auth.js";
import { backfillTeams, db } from "./db.js";
import { seed } from "./seed.js";
import { connectedUsers, recordFailure, syncUser } from "./gcal.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const clientDir = join(root, "dist", "client");
const production = process.env.NODE_ENV === "production";

await seed();
// Runs after seed(), not at module load: seed() is what creates the workspace, and a
// team registry backfilled before that would have nothing to backfill.
backfillTeams();

const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
      "connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(originGuard);
app.use(express.json({ limit: "256kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", api);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

if (existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(join(clientDir, "index.html"));
  });
}

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((error: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  const status = Number(error.status);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message || "Malformed request." });
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong on our side." });
});

/**
 * Refresh every connected Google calendar in the background. Google's iCal feed has no
 * push channel, so polling is the only option; every 20 minutes is frequent enough for
 * a schedule view and cheap enough to leave running.
 */
const GOOGLE_SYNC_MS = 20 * 60_000;

async function refreshGoogleCalendars() {
  for (const user of connectedUsers()) {
    try {
      await syncUser(user.id, user.google_calendar_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read that calendar.";
      // Keep the events already imported: a temporary outage should not empty the view.
      recordFailure(user.id, message);
      console.error(`Google calendar refresh failed for ${user.id}: ${message}`);
    }
  }
}

const syncTimer = setInterval(() => void refreshGoogleCalendars(), GOOGLE_SYNC_MS);
syncTimer.unref();
// One pass shortly after boot so a restart does not leave the view stale until the first tick.
setTimeout(() => void refreshGoogleCalendars(), 8_000).unref();

const port = Number(process.env.PORT) || 8787;
const server = app.listen(port, () => {
  console.log(`Lucent API listening on http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error("Failed to start HTTP server:", error);
  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(syncTimer);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});
