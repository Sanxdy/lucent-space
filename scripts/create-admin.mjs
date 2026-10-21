/**
 * Create or promote a workspace admin.
 *
 * A fresh install has nobody to sign in as, and registration may be closed. This is
 * the escape hatch: run it on the server, get an account, sign in, invite everyone else
 * from the Team page.
 *
 *   node scripts/create-admin.mjs you@example.com "Your Name"
 *   node scripts/create-admin.mjs you@example.com "Your Name" --password 'chosen-password'
 *
 * Without --password a random one is generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dbPath = process.env.DATABASE_PATH ?? join(root, "data", "lucent.db");

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const passwordFlag = args.indexOf("--password");
const chosenPassword = passwordFlag >= 0 ? args[passwordFlag + 1] : "";

const [email, name] = positional;
if (!email || !name) {
  console.error("Usage: node scripts/create-admin.mjs <email> <name> [--password <password>]");
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("That does not look like an email address.");
  process.exit(1);
}
if (chosenPassword && chosenPassword.length < 8) {
  console.error("The password must be at least 8 characters.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(root, "server", "schema.sql"), "utf8"));

// Reuse the app's own hashing so the stored format always matches what login expects.
const { hashPassword } = await import(join(root, "dist", "server", "auth.js"));

const now = new Date().toISOString();
const password = chosenPassword || randomBytes(9).toString("base64url");
const passwordHash = await hashPassword(password);
const uid = () => crypto.randomUUID();

let workspace = db.prepare("SELECT id FROM workspaces ORDER BY created_at LIMIT 1").get();
const createdWorkspace = !workspace;
if (!workspace) {
  workspace = { id: uid() };
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
    .run(workspace.id, "Lucent Studio", now);
  console.log(`Created workspace "Lucent Studio".`);
}

const existing = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
let userId;

if (existing) {
  userId = existing.id;
  db.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(name, passwordHash, userId);
  console.log(`Updated the password for ${email}.`);
} else {
  userId = uid();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, team, location, tz_offset, hue, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, email.toLowerCase(), name, passwordHash, "Admin", "Product", "", 0, Math.floor(Math.random() * 360), now);
  db.prepare("INSERT INTO settings (user_id) VALUES (?)").run(userId);
  console.log(`Created ${email}.`);
}

const membership = db.prepare("SELECT role FROM memberships WHERE user_id = ? AND workspace_id = ?")
  .get(userId, workspace.id);
if (membership) {
  db.prepare("UPDATE memberships SET role = 'admin' WHERE user_id = ? AND workspace_id = ?")
    .run(userId, workspace.id);
} else {
  db.prepare("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, 'admin')")
    .run(userId, workspace.id);
}

// The team registry is what the invite picker and the filters read.
const defaults = ["Product", "Design", "Engineering", "Marketing", "Operations"];
const hasTeams = db.prepare("SELECT 1 AS ok FROM teams WHERE workspace_id = ? LIMIT 1").get(workspace.id);
if (!hasTeams) {
  defaults.forEach((team, position) => {
    db.prepare("INSERT INTO teams (id, workspace_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(uid(), workspace.id, team, position, now);
  });
  console.log("Seeded the five default teams.");
}

db.prepare(
  "INSERT INTO activity (id, workspace_id, user_id, verb, subject, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(uid(), workspace.id, userId, "created", "an admin account from the command line", "/team", now);

console.log("");
console.log("Admin ready. Sign in with:");
console.log(`  email:    ${email.toLowerCase()}`);
if (chosenPassword) console.log("  password: (the one you passed in)");
else console.log(`  password: ${password}`);
console.log("");
console.log("Change the password from Settings after the first sign-in.");
if (createdWorkspace) console.log("This is a new workspace, so registration is open until the second account exists.");

db.close();
