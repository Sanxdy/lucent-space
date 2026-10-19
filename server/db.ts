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
