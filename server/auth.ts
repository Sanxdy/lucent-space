import { scrypt, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { row, run, nowIso } from "./db.js";

export const SESSION_COOKIE = "lucent_session";
const SESSION_DAYS = 30;

/** 2^17 · 8 · 1 needs ~134 MB; maxmem is raised above that so Node accepts it. */
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
/** Hashes written before the cost bump carry no params and used these values. */
const LEGACY_SCRYPT = { N: 2 ** 14, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };

const scryptAsync = (password: string, salt: string, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key)));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash.toString("hex")}`;
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let salt: string | undefined;
  let hash: string | undefined;
  let options: ScryptOptions = LEGACY_SCRYPT;
  if (stored.startsWith("scrypt$")) {
    const [scheme, n, r, p, storedSalt, storedHash] = stored.split("$");
    if (scheme !== "scrypt" || !storedSalt || !storedHash) return false;
    salt = storedSalt;
    hash = storedHash;
    options = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem };
    if (!Number.isFinite(options.N) || !Number.isFinite(options.r) || !Number.isFinite(options.p)) return false;
  } else {
    [salt, hash] = stored.split(":");
  }
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, options);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Constant hash so a login miss costs the same scrypt work as a hit. */
let dummyHash: Promise<string> | undefined;

export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("lucent-dummy-password");
  await verifyPassword(password, await dummyHash);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  team: string;
  location: string;
  tz_offset: number;
  hue: number;
  workspace_id: string;
  workspace_name: string;
  is_admin: boolean;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    sha256(token),
    userId,
    expires.toISOString(),
    nowIso(),
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    maxAge: SESSION_DAYS * 86_400_000,
    path: "/",
  });
}

export function destroySession(req: Request, res: Response) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decode(part.slice(index + 1));
  }
  return cookies;
}

export function currentUser(req: Request): SessionUser | undefined {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return undefined;
  const found = row<Omit<SessionUser, "is_admin"> & { is_admin: number }>(
    `SELECT u.id, u.email, u.name, u.role, u.team, u.location, u.tz_offset, u.hue,
            m.workspace_id, w.name AS workspace_name, m.role = 'admin' AS is_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.user_id = u.id
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token),
    nowIso(),
  );
  return found ? { ...found, is_admin: !!found.is_admin } : undefined;
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  (req as Request & { user: SessionUser }).user = user;
  next();
}

export function user(req: Request): SessionUser {
  return (req as Request & { user: SessionUser }).user;
}

/** Same-origin guard for state-changing requests. */
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin) {
    try {
      const got = new URL(origin);
      const expected = new URL(`${req.protocol}://${req.get("host")}`);
      if (got.protocol !== expected.protocol || got.host !== expected.host) {
        res.status(403).json({ error: "Cross-origin request rejected" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Bad origin" });
      return;
    }
    return next();
  }
  if (req.get("sec-fetch-site") === "same-origin") return next();
  res.status(403).json({ error: "Cross-origin request rejected" });
}

const attempts = new Map<string, { count: number; reset: number }>();
const MAX_ATTEMPTS = 12;
const ATTEMPT_WINDOW = 10 * 60_000;
const MAX_TRACKED = 10_000;

function attemptKey(req: Request): string {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${email}|${req.ip ?? "unknown"}`;
}

function pruneAttempts(now: number) {
  for (const [key, entry] of attempts) if (entry.reset < now) attempts.delete(key);
  while (attempts.size >= MAX_TRACKED) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = attemptKey(req);
  const now = Date.now();
  if (attempts.size >= MAX_TRACKED) pruneAttempts(now);
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + ATTEMPT_WINDOW });
    return next();
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    return;
  }
  next();
}

export function resetLoginAttempts(req: Request) {
  attempts.delete(attemptKey(req));
}
