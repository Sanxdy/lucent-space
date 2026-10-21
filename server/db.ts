import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? join(here, "..", "data", "lucent.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
// Databases created before the history seed lack this column; schema.sql only creates tables.
try {
  db.exec("ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
} catch {}

export const nowIso = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

/**
 * Columns added after the first release. schema.sql uses CREATE TABLE IF NOT
 * EXISTS, so it cannot alter an existing database; each one is tried in turn and
 * ignored when it is already there.
 */
for (const sql of [
  "ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN calendar_token TEXT",
  // Google Calendar -> Lucent. The URL is a bearer credential, so it is stored but
  // never returned to the client in full.
  "ALTER TABLE users ADD COLUMN google_calendar_url TEXT",
  "ALTER TABLE users ADD COLUMN google_calendar_synced_at TEXT",
  "ALTER TABLE users ADD COLUMN google_calendar_error TEXT NOT NULL DEFAULT ''",
]) {
  try {
    db.exec(sql);
  } catch {}
}

/** Avatar files live beside the database so a backup of data/ is complete. */
export const avatarDir = join(dirname(dbPath), "avatars");
mkdirSync(avatarDir, { recursive: true });

/** Row helpers: node:sqlite returns null-prototype objects. */
export function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function row<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}

export const isoDay = (date: Date = new Date()) => date.toLocaleDateString("en-CA");

let depth = 0;

/** Re-entrant transaction: nested calls join the outer one. fn must be synchronous. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec("BEGIN");
  depth = 1;
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    depth = 0;
  }
}

/**
 * Teams used to be a hardcoded list in the invite form. Backfill the registry so a
 * fresh workspace has the five defaults an admin can then edit, and so any team name
 * already in use by a member exists as a row. Idempotent, so it is safe on every boot.
 */
export const DEFAULT_TEAMS = ["Product", "Design", "Engineering", "Marketing", "Operations"];

export function backfillTeams() {
  const workspaces = rows<{ id: string }>("SELECT id FROM workspaces");
  for (const workspace of workspaces) {
    const existing = new Set(
      rows<{ name: string }>("SELECT name FROM teams WHERE workspace_id = ?", workspace.id).map((t) => t.name),
    );
    const inUse = rows<{ team: string }>(
      "SELECT DISTINCT u.team FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.workspace_id = ?",
      workspace.id,
    ).map((r) => r.team);
    const wanted = [...new Set([...DEFAULT_TEAMS, ...inUse])].filter((name) => name && !existing.has(name));
    if (!wanted.length) continue;
    let position = existing.size;
    tx(() => {
      for (const name of wanted) {
        run(
          "INSERT OR IGNORE INTO teams (id, workspace_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
          uid(), workspace.id, name, position++, nowIso(),
        );
      }
    });
  }
}

