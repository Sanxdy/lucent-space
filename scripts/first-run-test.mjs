/**
 * First-run checks: a fresh install must be reachable.
 *
 * Two paths are tested, because both are documented and either can rot:
 *   1. the CLI creates an admin on an empty database
 *   2. an empty database accepts exactly one self-registration, which becomes admin
 *
 * Each runs against its own throwaway database and its own port; the real data is
 * never touched.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = "/srv/lucent";
const NODE = process.execPath;

let pass = 0;
let fail = 0;
function check(name, condition, extra = "") {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}${extra ? ` -> ${extra}` : ""}`);
}

const scratch = mkdtempSync(join(tmpdir(), "lucent-first-run-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call the API the way a browser would: same-origin, no Origin header needed. */
async function api(port, path, { method = "GET", body, cookie } = {}) {
  const headers = { "Content-Type": "application/json", "sec-fetch-site": "same-origin" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() ?? [] };
}

async function startServer(dbPath, port) {
  const child = spawn(NODE, [join(ROOT, "dist", "server", "index.js")], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_PATH: dbPath, PORT: String(port), NODE_ENV: "production" },
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i += 1) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
  }
  child.kill();
  throw new Error(`server on port ${port} never became healthy`);
}

/* ------------------------------------------------ path 1: the CLI makes an admin */

console.log("=== path 1: create-admin on an empty database ===");
const db1 = join(scratch, "one.db");
const cli = spawn(NODE, [join(ROOT, "scripts", "create-admin.mjs"), "owner@example.com", "Fresh Owner", "--password", "chosen-password-1"], {
  cwd: ROOT,
  env: { ...process.env, DATABASE_PATH: db1 },
});
const cliOut = await new Promise((resolve) => {
  let out = "";
  cli.stdout.on("data", (d) => (out += d));
  cli.stderr.on("data", (d) => (out += d));
  cli.on("close", () => resolve(out));
});
check("the CLI exits cleanly", /Admin ready/.test(cliOut), cliOut.split("\n")[0]);
check("it honours the password it was given", !/password: [A-Za-z0-9]{12}/.test(cliOut), "no generated password printed");

const inspect1 = new DatabaseSync(db1, { readOnly: true });
const user1 = inspect1.prepare("SELECT email, name, role FROM users").all();
const mem1 = inspect1.prepare("SELECT role FROM memberships").all();
const teams1 = inspect1.prepare("SELECT name FROM teams ORDER BY position").all();
inspect1.close();
check("exactly one user was created", user1.length === 1, `${user1.length}`);
check("it is an admin", mem1[0]?.role === "admin", mem1[0]?.role);
check("the default teams were seeded", teams1.length === 5, teams1.map((t) => t.name).join(","));

const srv1 = await startServer(db1, 8911);
try {
  const login = await api(8911, "/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.com", password: "chosen-password-1" },
  });
  check("the created admin can sign in", login.status === 200, String(login.status));

  const cookie = (login.setCookie[0] ?? "").split(";")[0];
  const boot = await api(8911, "/api/bootstrap", { cookie });
  check("the session is an admin session", boot.json.me?.is_admin === true, String(boot.json.me?.is_admin));
  check("the workspace is usable immediately", (boot.json.teams?.length ?? 0) === 5, `${boot.json.teams?.length} teams`);

  const second = await api(8911, "/api/auth/register", {
    method: "POST",
    body: { name: "Sneaky", email: "sneaky@example.com", password: "password123" },
  });
  check("a second account cannot self-register", second.status === 403, `${second.status} ${second.json.error ?? ""}`);
} finally {
  srv1.kill();
}

/* ------------------------------------- path 2: the first sign-up becomes the admin */

console.log("=== path 2: first self-registration on an empty install ===");
const db2 = join(scratch, "two.db");
const srv2 = await startServer(db2, 8912);
try {
  const first = await api(8912, "/api/auth/register", {
    method: "POST",
    body: { name: "First Owner", email: "first@example.com", password: "password123" },
  });
  check("the first registration is accepted even with registration closed", first.status === 201, String(first.status));

  const second = await api(8912, "/api/auth/register", {
    method: "POST",
    body: { name: "Second", email: "second@example.com", password: "password123" },
  });
  check("the second registration is refused", second.status === 403, `${second.status} ${second.json.error ?? ""}`);

  const login = await api(8912, "/api/auth/login", {
    method: "POST",
    body: { email: "first@example.com", password: "password123" },
  });
  check("the first account can sign in", login.status === 200, String(login.status));

  const cookie = (login.setCookie[0] ?? "").split(";")[0];
  const boot = await api(8912, "/api/bootstrap", { cookie });
  check("the first account owns the workspace as admin", boot.json.me?.is_admin === true, String(boot.json.me?.is_admin));
  check("its workspace has the default teams", (boot.json.teams?.length ?? 0) === 5, `${boot.json.teams?.length} teams`);
} finally {
  srv2.kill();
}

/* --------------------------------------------------------------- CLI validation */

console.log("=== the CLI refuses bad input ===");
async function cliRun(args) {
  const child = spawn(NODE, [join(ROOT, "scripts", "create-admin.mjs"), ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_PATH: join(scratch, "reject.db") },
  });
  return new Promise((resolve) => {
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}
const noArgs = await cliRun([]);
check("no arguments is a usage error", noArgs.code === 1 && /Usage/.test(noArgs.out), noArgs.out.split("\n")[0]);
const badEmail = await cliRun(["not-an-email", "Name"]);
check("a malformed email is refused", badEmail.code === 1 && /email address/.test(badEmail.out), badEmail.out.split("\n")[0]);
const shortPw = await cliRun(["a@b.co", "Name", "--password", "short"]);
check("a too-short password is refused", shortPw.code === 1 && /at least 8/.test(shortPw.out), shortPw.out.split("\n")[0]);

rmSync(scratch, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
