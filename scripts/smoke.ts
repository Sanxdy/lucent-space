/**
 * End-to-end smoke test: boots the API against a throwaway SQLite file and
 * walks the critical paths with real HTTP + cookie handling.
 *
 *   npm run smoke
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "lucent-smoke-"));
const dbPath = join(dir, "smoke.db");

let cookie = "";
let failures = 0;

const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(PORT), DATABASE_PATH: dbPath, NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "inherit"],
});

function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}`, detail ?? "");
  }
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((value) => value.startsWith("lucent_session="));
  if (session) cookie = session.split(";")[0];
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not start");
}

try {
  await waitForServer();
  console.log("Lucent smoke test");

  const email = `smoke-${Date.now()}@example.com`;
  const register = await call("POST", "/api/auth/register", { name: "Smoke Tester", email, password: "smoketest123" });
  check("register returns 201 and a session", register.status === 201 && cookie.length > 0, register);

  const me = await call("GET", "/api/auth/me");
  check("session resolves to the new user", me.status === 200 && me.data.user?.email === email, me.data);

  const boot = await call("GET", "/api/bootstrap");
  check("bootstrap ships seeded workspace", boot.status === 200 && boot.data.tasks?.length > 0 && boot.data.projects?.length > 0);

  const task = boot.data.tasks[0];
  const patched = await call("PATCH", `/api/tasks/${task.id}`, { status: "in_review", priority: "high" });
  const afterPatch = await call("GET", "/api/bootstrap");
  const stored = afterPatch.data.tasks.find((item: any) => item.id === task.id);
  check("task update persists", patched.status === 200 && stored?.status === "in_review", { patched, stored });

  const created = await call("POST", "/api/tasks", { title: "Smoke test task", project_id: boot.data.projects[0].id, status: "todo", priority: "medium" });
  check("task creation returns an id", created.status === 201 && typeof created.data.id === "string", created.data);

  const event = await call("POST", "/api/events", { title: "Smoke sync", starts_at: "2026-10-20T10:00", duration_min: 30, kind: "meeting", location: "Zoom" });
  check("event creation succeeds", event.status === 201, event.data);

  const insights = await call("GET", "/api/insights?range=30");
  check("insights respond with buckets", insights.status === 200 && Array.isArray(insights.data.buckets) && insights.data.buckets.length === 30);

  const focus = await call("POST", "/api/focus", { minutes: 25, task_id: created.data.id });
  check("focus session is recorded", focus.status === 201, focus.data);

  const settings = await call("PATCH", "/api/settings", { wall: "dusk", accent: "teal" });
  const afterSettings = await call("GET", "/api/bootstrap");
  check("settings persist", settings.status === 200 && afterSettings.data.settings?.wall === "dusk", afterSettings.data.settings);

  const csv = await fetch(`${BASE}/api/export.csv`, { headers: { Cookie: cookie } });
  check("CSV export has a header row", csv.status === 200 && (await csv.text()).startsWith("title,project,status"));

  const out = await call("POST", "/api/auth/logout");
  check("logout succeeds", out.status === 200);
  cookie = "";
  const after = await call("GET", "/api/bootstrap");
  check("bootstrap rejects signed-out requests", after.status === 401, after.data);

  const login = await call("POST", "/api/auth/login", { email, password: "smoketest123" });
  check("login works after logout", login.status === 200 && cookie.length > 0, login.data);

  // ---- bearer tokens: a bridge client never holds a cookie --------------------
  async function bearer(method: string, path: string, token: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Deliberately no Origin and no Cookie: this is how a bot calls the API.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, data, setCookie: res.headers.getSetCookie?.() ?? [] };
  }

  const minted = await bearer("POST", "/api/auth/token", "", { email, password: "smoketest123", name: "smoke bridge" });
  const token: string = minted.data?.token ?? "";
  check("token mints from credentials without a cookie", minted.status === 201 && token.length > 20, minted.data);
  check("minting sets no session cookie", minted.setCookie.every((c) => !c.startsWith("lucent_session=")), minted.setCookie);
  check("token response reports an expiry", typeof minted.data?.expires_at === "string", minted.data);

  const tokenMe = await bearer("GET", "/api/auth/me", token);
  check("bearer resolves to the same user", tokenMe.status === 200 && tokenMe.data.user?.email === email, tokenMe.data);

  // Any member may create a task; this proves a bearer write clears the origin guard
  // without needing admin rights.
  const tokenWrite = await bearer("POST", "/api/tasks", token, { title: `Bearer task ${Date.now()}` });
  check("a bearer write passes the origin guard with no Origin", tokenWrite.status === 201, tokenWrite.data);

  const listed = await bearer("GET", "/api/tasks?assignee=me&status=todo&limit=5", token);
  check("narrow task list answers for the bearer",
    listed.status === 200 && Array.isArray(listed.data.tasks) && listed.data.tasks.length <= 5, listed.data);

  const badFilter = await bearer("GET", "/api/tasks?status=nonsense", token);
  check("an unknown status filter is ignored rather than erroring", badFilter.status === 200, badFilter.data);

  // "product" lowercase must resolve to the seeded "Product" team.
  const teamPatch = await bearer("PATCH", "/api/profile", token, { name: "Smoke Tester", email, team: "product" });
  check("profile accepts a team case-insensitively", teamPatch.status === 200, teamPatch.data);
  const afterTeam = await call("GET", "/api/auth/me");
  check("the team was stored with the registry spelling", afterTeam.data.user?.team, "Product");

  const badTeam = await bearer("PATCH", "/api/profile", token, { name: "Smoke Tester", email, team: "No Such Team" });
  check("profile rejects an unknown team", badTeam.status === 400, badTeam.data);

  const revoked = await bearer("DELETE", "/api/auth/token", token);
  check("token revokes", revoked.status === 200, revoked.data);
  const afterRevoke = await bearer("GET", "/api/auth/me", token);
  check("a revoked token no longer authenticates", afterRevoke.status === 200 && afterRevoke.data.user === null, afterRevoke.data);

  const cookieStillWorks = await call("GET", "/api/auth/me");
  check("the cookie session is unaffected by token flows", cookieStillWorks.data.user?.email === email, cookieStillWorks.data);

  const photos = await call("GET", "/api/bootstrap");
  const memberKeys = Object.keys(photos.data.members?.[0] ?? {});
  check("bootstrap members expose avatar", memberKeys.includes("avatar"), memberKeys);
} catch (error) {
  failures += 1;
  console.error(error);
} finally {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
