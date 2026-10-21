import { Router } from "express";
import type { Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TEAMS, avatarDir, row, rows, run, uid, nowIso, tx, isoDay } from "./db.js";
import {
  FeedError, disconnect as gcalDisconnect, eventsBetween, maskFeedUrl,
  syncUser, validateFeedUrl,
} from "./gcal.js";
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  loginRateLimit,
  requireUser,
  resetLoginAttempts,
  user,
  verifyDummy,
  verifyPassword,
  isLegacyHash,
} from "./auth.js";
import { resetWorkspace } from "./seed.js";
import { buildInsights } from "./insights.js";
import { projectColor } from "./palette.js";

export const api = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Bearer token lifetime. Long enough for a bridge, short enough to expire. */
const TOKEN_DAYS = 30;
const text = (value: unknown, max = 400) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const TASK_STATUS = ["todo", "in_progress", "in_review", "done"] as const;
const PRIORITY = ["none", "low", "medium", "high", "urgent"] as const;
const PROJECT_STATUS = ["planning", "active", "review", "shipped"] as const;

const OPEN_REGISTRATION = process.env.ALLOW_OPEN_REGISTRATION
  ? process.env.ALLOW_OPEN_REGISTRATION === "1" || process.env.ALLOW_OPEN_REGISTRATION === "true"
  : process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1";

const idOf = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** null for absent/blank, null for NaN/Infinity, the number otherwise. */
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const safeJson = (value: unknown): unknown => {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return {};
  }
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Returns YYYY-MM-DD, null for blank, undefined for invalid. */
function dateOnly(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    return undefined;
  }
  return `${year}-${month}-${day}`;
}

/** Returns YYYY-MM-DDTHH:MM (wall clock, any zone suffix dropped so string ordering stays consistent). */
function dateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = DATE_TIME.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match;
  const date = dateOnly(`${year}-${month}-${day}`);
  if (!date) return undefined;
  if (hour === undefined) return `${date}T00:00`;
  if (Number(hour) > 23 || Number(minute) > 59) return undefined;
  return `${date}T${hour}:${minute}`;
}

/** Throws a 400 when a referenced row is missing or belongs to another workspace. */
function assertInWorkspace(table: "projects" | "tasks" | "users", id: string, workspaceId: string) {
  const found =
    table === "users"
      ? row("SELECT 1 AS ok FROM memberships WHERE user_id = ? AND workspace_id = ?", id, workspaceId)
      : row(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND workspace_id = ?`, id, workspaceId);
  if (found) return;
  const label = table === "projects" ? "project" : table === "tasks" ? "task" : "person";
  throw Object.assign(new Error(`That ${label} isn’t part of this workspace.`), { status: 400 });
}

function logActivity(workspaceId: string, userId: string, verb: string, subject: string, href = "") {
  run(
    "INSERT INTO activity (id, workspace_id, user_id, verb, subject, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    uid(), workspaceId, userId, verb, subject, href, nowIso(),
  );
}

function notify(workspaceId: string, userId: string | null, kind: string, title: string, body: string, href: string) {
  run(
    "INSERT INTO notifications (id, workspace_id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid(), workspaceId, userId, kind, title, body, href, nowIso(),
  );
}

function me(req: Request) {
  return user(req);
}

/* ---------------------------------- auth --------------------------------- */

api.post("/auth/register", loginRateLimit, async (req, res) => {
  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 160).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!emailRe.test(email)) return res.status(400).json({ error: "That email doesn’t look right." });
  if (password.length < 8) return res.status(400).json({ error: "Use at least 8 characters." });

  const existing = row<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  if (existing) {
    const inviteToken = typeof req.body?.invite_token === "string" ? req.body.invite_token : "";
    if (!OPEN_REGISTRATION && inviteToken && (await verifyPassword(inviteToken, existing.password_hash))) {
      const passwordHash = await hashPassword(password);
      run("UPDATE users SET name = ?, password_hash = ? WHERE id = ?", name, passwordHash, existing.id);
      createSession(res, existing.id);
      return res.status(201).json({ ok: true });
    }
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  /**
   * A brand-new install has no accounts, so closing registration would lock everyone
   * out of their own server. The first account to register becomes the workspace admin;
   * after that, registration follows the normal rule.
   */
  const firstRun = !row("SELECT 1 AS ok FROM users LIMIT 1");
  if (!OPEN_REGISTRATION && !firstRun) {
    return res.status(403).json({ error: "Registration is closed. Ask a workspace admin for an invite." });
  }

  const id = uid();
  const passwordHash = await hashPassword(password);
  const hue = Math.floor(Math.random() * 360);

  tx(() => {
    let workspace = row<{ id: string }>("SELECT id FROM workspaces ORDER BY created_at LIMIT 1");
    // No workspace yet means this is the first account on this server.
    const first = !workspace;
    if (!workspace) {
      workspace = { id: uid() };
      run("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)", workspace.id, "Lucent Studio", nowIso());
    }
    run(
      `INSERT INTO users (id, email, name, password_hash, role, team, location, tz_offset, hue, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, email, name, passwordHash, "Team member", "Product", "", 0, hue, nowIso(),
    );
    run("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", id, workspace.id, first ? "admin" : "member");
    run("INSERT INTO settings (user_id) VALUES (?)", id);
    logActivity(workspace.id, id, "joined", "the workspace");
    // backfillTeams() ran at boot, before this workspace existed, so a workspace born
    // here would otherwise have an empty team registry and no team to invite into.
    if (first) {
      DEFAULT_TEAMS.forEach((name, position) => {
        run("INSERT OR IGNORE INTO teams (id, workspace_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
            uid(), workspace!.id, name, position, nowIso());
      });
    }
  });

  createSession(res, id);
  res.status(201).json({ ok: true });
});

api.post("/auth/login", loginRateLimit, async (req, res) => {
  const email = text(req.body?.email, 160).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const found = row<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  if (!found) {
    await verifyDummy(password);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (!(await verifyPassword(password, found.password_hash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (isLegacyHash(found.password_hash)) {
    run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(password), found.id);
  }
  run("DELETE FROM sessions WHERE expires_at <= ?", nowIso());
  createSession(res, found.id);
  resetLoginAttempts(req);
  res.json({ ok: true });
});

api.post("/auth/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

api.get("/auth/me", (req, res) => {
  const current = currentUser(req);
  res.json({ user: current ?? null });
});

/**
 * Mint a bearer token for clients that never hold a cookie. Accepts either an
 * existing session or credentials, and sets no cookie: the raw token is returned
 * once and only its sha256 is stored, so a database leak yields nothing usable.
 */
api.post("/auth/token", loginRateLimit, async (req, res) => {
  let userId = currentUser(req)?.id;
  if (!userId) {
    const email = text(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const found = row<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE email = ?", email,
    );
    if (!found || !(await verifyPassword(password, found.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    resetLoginAttempts(req);
    userId = found.id;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_DAYS * 86_400_000).toISOString();
  run(
    "INSERT INTO api_tokens (token_hash, user_id, name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    createHash("sha256").update(token).digest("hex"), userId,
    text(req.body?.name, 80) || "API token", expiresAt, nowIso(),
  );
  res.status(201).json({ token, user_id: userId, expires_at: expiresAt });
});

/** Revoke the bearer token that made this request. */
api.delete("/auth/token", requireUser, (req, res) => {
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer) {
    run("DELETE FROM api_tokens WHERE token_hash = ?", createHash("sha256").update(bearer).digest("hex"));
  }
  res.json({ ok: true });
});

/* ------------------------------- bootstrap ------------------------------- */

api.get("/bootstrap", requireUser, (req, res) => {
  const actor = me(req);
  const workspaceId = actor.workspace_id;

  const members = rows(
    `SELECT u.id, u.name, u.email, u.role, u.team, u.location, u.tz_offset, u.hue, u.avatar,
            m.role AS workspace_role
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE m.workspace_id = ? ORDER BY u.created_at`,
    workspaceId,
  );

  const projectRows = rows<Record<string, unknown>>("SELECT * FROM projects WHERE workspace_id = ? ORDER BY position", workspaceId);
  const taskRows = rows<{
    id: string; project_id: string | null; assignee_id: string | null; status: string; due_date: string | null;
    estimate: number | null; created_at: string; done_at: string | null;
  }>("SELECT * FROM tasks WHERE workspace_id = ? AND archived = 0 ORDER BY position, created_at DESC", workspaceId);

  const subtasks = rows<{ id: string; task_id: string; title: string; done: number; position: number }>(
    `SELECT s.* FROM subtasks s JOIN tasks t ON t.id = s.task_id
      WHERE t.workspace_id = ? AND t.archived = 0 ORDER BY s.position`,
    workspaceId,
  );
  // Cap per-task comment history so a chatty task can't inflate the whole payload.
  const comments = rows<{ id: string; task_id: string; user_id: string | null; body: string; created_at: string }>(
    `SELECT id, task_id, user_id, body, created_at FROM (
       SELECT c.id, c.task_id, c.user_id, c.body, c.created_at,
              ROW_NUMBER() OVER (PARTITION BY c.task_id ORDER BY c.created_at DESC) AS rn
         FROM comments c JOIN tasks t ON t.id = c.task_id
        WHERE t.workspace_id = ? AND t.archived = 0
     ) WHERE rn <= 50 ORDER BY created_at`,
    workspaceId,
  );
  const milestoneRows = rows<Record<string, unknown>>(
    `SELECT m.* FROM milestones m JOIN projects p ON p.id = m.project_id
      WHERE p.workspace_id = ? ORDER BY m.due_date`,
    workspaceId,
  );

  const projects = projectRows.map((p) => {
    const projectTasks = taskRows.filter((t) => t.project_id === p.id);
    const done = projectTasks.filter((t) => t.status === "done").length;
    const milestones = milestoneRows.filter((m) => m.project_id === p.id).map((m) => ({ ...m, done: !!m.done }));
    return {
      ...p,
      color: projectColor(p.color),
      pinned: !!p.pinned,
      task_count: projectTasks.length,
      done_count: done,
      progress: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0,
      member_ids: [...new Set(projectTasks.map((t) => t.assignee_id).filter(Boolean))],
      next_milestone: milestones.find((m) => !m.done) ?? null,
      milestones,
    };
  });

  const tasks = taskRows.map((t) => ({
    ...t,
    subtasks: subtasks.filter((s) => s.task_id === t.id).map((s) => ({ ...s, done: !!s.done })),
    comments: comments.filter((c) => c.task_id === t.id),
  }));

  const notifications = rows<{ id: string; kind: string; title: string; body: string; href: string; created_at: string; read: number }>(
    `SELECT n.id, n.kind, n.title, n.body, n.href, n.created_at,
            EXISTS(SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = ?) AS read
       FROM notifications n WHERE n.workspace_id = ? ORDER BY n.created_at DESC LIMIT 20`,
    actor.id, workspaceId,
  ).map((n) => ({ ...n, read: !!n.read }));

  const activity = rows(
    `SELECT a.id, a.verb, a.subject, a.href, a.created_at, u.name AS user_name, u.hue
       FROM activity a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 25`,
    workspaceId,
  );

  const settings = row<Record<string, unknown>>("SELECT * FROM settings WHERE user_id = ?", actor.id);
  const focusToday = row<{ minutes: number; sessions: number }>(
    `SELECT COALESCE(SUM(minutes), 0) AS minutes, COUNT(*) AS sessions FROM focus_sessions
      WHERE user_id = ? AND substr(ended_at, 1, 10) = ?`,
    actor.id, isoDay(),
  );

  const calendarToken = row<{ calendar_token: string | null }>("SELECT calendar_token FROM users WHERE id = ?", actor.id);

  res.json({
    me: actor,
    workspace: { id: workspaceId, name: actor.workspace_name },
    calendar: { has_feed: !!calendarToken?.calendar_token, token: calendarToken?.calendar_token ?? null },
    members,
    teams: rows<{ id: string; name: string; position: number }>(
      "SELECT id, name, position FROM teams WHERE workspace_id = ? ORDER BY position, name", workspaceId,
    ),
    projects,
    tasks,
    events: rows("SELECT * FROM events WHERE workspace_id = ? ORDER BY starts_at", workspaceId),
    notifications,
    activity,
    settings: {
      theme: settings?.theme ?? "dark",
      wall: settings?.wall ?? "ash",
      glass: settings?.glass ?? "tinted",
      accent: settings?.accent ?? "blue",
      solid: !!settings?.solid,
      focus_minutes: settings?.focus_minutes ?? 25,
      break_minutes: settings?.break_minutes ?? 5,
      notify: safeJson(settings?.notify),
    },
    focus: { minutes: focusToday?.minutes ?? 0, sessions: focusToday?.sessions ?? 0 },
  });
});

/* --------------------------------- tasks --------------------------------- */

/**
 * Narrow task list for polling clients. /bootstrap is the only other bulk read and
 * is far too large to poll, so this returns just the rows and no joins.
 */
api.get("/tasks", requireUser, (req, res) => {
  const actor = me(req);
  const assignee = req.query.assignee === "me" ? actor.id : idOf(req.query.assignee);
  const rawStatus = String(req.query.status ?? "");
  const status = (TASK_STATUS as readonly string[]).includes(rawStatus) ? rawStatus : "";
  const projectId = idOf(req.query.project_id);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

  const where = ["workspace_id = ?", "archived = 0"];
  const params: unknown[] = [actor.workspace_id];
  if (assignee) {
    assertInWorkspace("users", assignee, actor.workspace_id);
    where.push("assignee_id = ?");
    params.push(assignee);
  }
  if (status) { where.push("status = ?"); params.push(status); }
  if (projectId) {
    assertInWorkspace("projects", projectId, actor.workspace_id);
    where.push("project_id = ?");
    params.push(projectId);
  }

  res.json({
    tasks: rows(
      `SELECT id, title, description, status, priority, project_id, assignee_id,
              created_by, created_at, done_at
         FROM tasks WHERE ${where.join(" AND ")} ORDER BY position LIMIT ?`,
      ...params, limit,
    ),
  });
});

api.post("/tasks", requireUser, (req, res) => {
  const actor = me(req);
  const title = text(req.body?.title, 160);
  if (!title) return res.status(400).json({ error: "A task needs a title." });
  const projectId = idOf(req.body?.project_id);
  if (projectId) assertInWorkspace("projects", projectId, actor.workspace_id);
  const assigneeId = idOf(req.body?.assignee_id) ?? actor.id;
  if (assigneeId !== actor.id) assertInWorkspace("users", assigneeId, actor.workspace_id);
  const dueDate = dateOnly(req.body?.due_date);
  if (dueDate === undefined) return res.status(400).json({ error: "That due date isn’t valid." });

  const id = uid();
  tx(() => {
    const position = (row<{ n: number }>("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM tasks WHERE workspace_id = ?", actor.workspace_id)?.n ?? 1);
    run(
      `INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority, assignee_id, due_date, estimate, position, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, actor.workspace_id, projectId, title, text(req.body?.description, 2000),
      oneOf(req.body?.status, TASK_STATUS, "todo"), oneOf(req.body?.priority, PRIORITY, "none"), assigneeId,
      dueDate, num(req.body?.estimate), position, actor.id, nowIso(),
    );
    if (assigneeId !== actor.id) {
      notify(actor.workspace_id, assigneeId, "task", "A task was assigned to you", title, "/tasks");
    }
    logActivity(actor.workspace_id, actor.id, "created", title, "/tasks");
  });
  res.status(201).json({ id });
});

api.patch("/tasks/:id", requireUser, (req, res) => {
  const actor = me(req);
  const existing = row<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  if (!existing) return res.status(404).json({ error: "Task not found." });

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (typeof req.body?.title === "string") {
    const title = text(req.body.title, 160);
    if (!title) return res.status(400).json({ error: "A task needs a title." });
    set("title", title);
  }
  if (typeof req.body?.description === "string") set("description", text(req.body.description, 2000));
  if (req.body?.status !== undefined) {
    const status = oneOf(req.body.status, TASK_STATUS, existing.status as (typeof TASK_STATUS)[number]);
    set("status", status);
    set("done_at", status === "done" ? (existing.done_at ?? nowIso()) : null);
  }
  if (req.body?.priority !== undefined) set("priority", oneOf(req.body.priority, PRIORITY, "none"));
  if (req.body?.project_id !== undefined) {
    const projectId = idOf(req.body.project_id);
    if (projectId) assertInWorkspace("projects", projectId, actor.workspace_id);
    set("project_id", projectId);
  }
  let nextAssignee: string | null | undefined;
  if (req.body?.assignee_id !== undefined) {
    const assigneeId = idOf(req.body.assignee_id);
    if (assigneeId && assigneeId !== actor.id) assertInWorkspace("users", assigneeId, actor.workspace_id);
    nextAssignee = assigneeId;
    set("assignee_id", assigneeId);
  }
  if (req.body?.due_date !== undefined) {
    const dueDate = dateOnly(req.body.due_date);
    if (dueDate === undefined) return res.status(400).json({ error: "That due date isn’t valid." });
    set("due_date", dueDate);
  }
  if (req.body?.estimate !== undefined) set("estimate", num(req.body.estimate));
  if (req.body?.position !== undefined) set("position", num(req.body.position) ?? 0);

  if (fields.length) {
    run(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, ...values, req.params.id);
  }

  if (req.body?.status === "done" && existing.status !== "done") {
    logActivity(actor.workspace_id, actor.id, "completed", String(existing.title), "/tasks");
  }
  if (nextAssignee && nextAssignee !== actor.id && nextAssignee !== existing.assignee_id) {
    notify(actor.workspace_id, nextAssignee, "task", "A task was assigned to you", String(existing.title), "/tasks");
  }
  res.json({ ok: true });
});

api.delete("/tasks/:id", requireUser, (req, res) => {
  const actor = me(req);
  run("DELETE FROM tasks WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  res.json({ ok: true });
});

api.post("/tasks/:id/subtasks", requireUser, (req, res) => {
  const actor = me(req);
  const task = row("SELECT id FROM tasks WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  const title = text(req.body?.title, 160);
  if (!title) return res.status(400).json({ error: "A subtask needs a title." });
  const id = uid();
  const position = row<{ n: number }>("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM subtasks WHERE task_id = ?", req.params.id)?.n ?? 1;
  run("INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, 0, ?)", id, req.params.id, title, position);
  res.status(201).json({ id });
});

api.patch("/subtasks/:id", requireUser, (req, res) => {
  const actor = me(req);
  const sub = row<{ task_id: string }>(
    "SELECT s.task_id FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ? AND t.workspace_id = ?",
    req.params.id, actor.workspace_id,
  );
  if (!sub) return res.status(404).json({ error: "Subtask not found." });
  run("UPDATE subtasks SET done = ? WHERE id = ?", req.body?.done ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

api.delete("/subtasks/:id", requireUser, (req, res) => {
  const actor = me(req);
  run(
    "DELETE FROM subtasks WHERE id IN (SELECT s.id FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ? AND t.workspace_id = ?)",
    req.params.id, actor.workspace_id,
  );
  res.json({ ok: true });
});

api.post("/tasks/:id/comments", requireUser, (req, res) => {
  const actor = me(req);
  const task = row("SELECT id, title FROM tasks WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  const body = text(req.body?.body, 2000);
  if (!body) return res.status(400).json({ error: "Write something first." });
  const id = uid();
  run("INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", id, req.params.id, actor.id, body, nowIso());
  res.status(201).json({ id });
});

/* -------------------------------- projects ------------------------------- */

api.post("/projects", requireUser, (req, res) => {
  const actor = me(req);
  const name = text(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: "A project needs a name." });
  const leadId = idOf(req.body?.lead_id) ?? actor.id;
  if (leadId !== actor.id) assertInWorkspace("users", leadId, actor.workspace_id);
  const dueDate = dateOnly(req.body?.due_date);
  if (dueDate === undefined) return res.status(400).json({ error: "That due date isn’t valid." });

  const id = uid();
  const position = row<{ n: number }>("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM projects WHERE workspace_id = ?", actor.workspace_id)?.n ?? 1;
  run(
    `INSERT INTO projects (id, workspace_id, name, description, status, color, due_date, lead_id, pinned, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id, actor.workspace_id, name, text(req.body?.description, 1000),
    oneOf(req.body?.status, PROJECT_STATUS, "planning"), text(req.body?.color, 20) || "blue",
    dueDate, leadId, position, nowIso(),
  );
  logActivity(actor.workspace_id, actor.id, "created project", name, "/projects");
  res.status(201).json({ id });
});

api.patch("/projects/:id", requireUser, (req, res) => {
  const actor = me(req);
  const existing = row<Record<string, unknown>>("SELECT * FROM projects WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  if (!existing) return res.status(404).json({ error: "Project not found." });
  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { fields.push(`${column} = ?`); values.push(value); };
  if (typeof req.body?.name === "string") set("name", text(req.body.name, 120));
  if (typeof req.body?.description === "string") set("description", text(req.body.description, 1000));
  if (req.body?.status !== undefined) set("status", oneOf(req.body.status, PROJECT_STATUS, "planning"));
  if (req.body?.color !== undefined) set("color", text(req.body.color, 20));
  if (req.body?.due_date !== undefined) {
    const dueDate = dateOnly(req.body.due_date);
    if (dueDate === undefined) return res.status(400).json({ error: "That due date isn’t valid." });
    set("due_date", dueDate);
  }
  if (req.body?.lead_id !== undefined) {
    const leadId = idOf(req.body.lead_id);
    if (leadId) assertInWorkspace("users", leadId, actor.workspace_id);
    set("lead_id", leadId);
  }
  if (req.body?.pinned !== undefined) set("pinned", req.body.pinned ? 1 : 0);
  if (fields.length) run(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`, ...values, req.params.id);
  res.json({ ok: true });
});

/**
 * Admin-only: delete a project. Its milestones cascade away; its tasks survive
 * with project_id cleared (ON DELETE SET NULL) so nobody loses work silently.
 * The response reports how many tasks were unlinked.
 */
api.delete("/projects/:id", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can delete projects." });
  const project = row<{ id: string; name: string }>(
    "SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?", String(req.params.id), actor.workspace_id,
  );
  if (!project) return res.status(404).json({ error: "Project not found." });
  const unlinked = rows<{ id: string }>(
    "SELECT id FROM tasks WHERE project_id = ? AND workspace_id = ?", project.id, actor.workspace_id,
  ).length;

  tx(() => {
    run("DELETE FROM projects WHERE id = ?", project.id);
    logActivity(actor.workspace_id, actor.id, "deleted project", project.name, "/projects");
  });
  res.json({ ok: true, unlinked_tasks: unlinked });
});

/* --------------------------------- events -------------------------------- */

api.post("/events", requireUser, (req, res) => {
  const actor = me(req);
  const title = text(req.body?.title, 140);
  const startsAt = dateTime(req.body?.starts_at);
  if (!title || startsAt === null) return res.status(400).json({ error: "An event needs a title and a start time." });
  if (startsAt === undefined) return res.status(400).json({ error: "That start time isn’t valid." });
  const id = uid();
  run(
    `INSERT INTO events (id, workspace_id, title, starts_at, duration_min, location, kind, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, actor.workspace_id, title, startsAt, Math.min(480, Math.max(5, num(req.body?.duration_min) ?? 30)),
    text(req.body?.location, 120), oneOf(req.body?.kind, ["meeting", "review", "team", "focus"] as const, "meeting"), actor.id,
  );
  logActivity(actor.workspace_id, actor.id, "scheduled", title, "/calendar");
  res.status(201).json({ id });
});

api.delete("/events/:id", requireUser, (req, res) => {
  const actor = me(req);
  run("DELETE FROM events WHERE id = ? AND workspace_id = ?", req.params.id, actor.workspace_id);
  res.json({ ok: true });
});

/* -------------------------------- settings ------------------------------- */

api.patch("/settings", requireUser, (req, res) => {
  const actor = me(req);
  const current = row<Record<string, unknown>>("SELECT * FROM settings WHERE user_id = ?", actor.id);
  if (!current) return res.status(404).json({ error: "Settings not found." });
  const next = {
    theme: oneOf(req.body?.theme ?? current.theme, ["light", "dark", "auto"] as const, "dark"),
    wall: oneOf(req.body?.wall ?? current.wall, ["ash", "smoke", "dusk", "aurora", "bloom", "ember", "grove", "tide"] as const, "ash"),
    glass: oneOf(req.body?.glass ?? current.glass, ["tinted", "clear"] as const, "tinted"),
    accent: oneOf(req.body?.accent ?? current.accent, ["blue", "purple", "pink", "orange", "green", "teal", "graphite"] as const, "blue"),
    solid: req.body?.solid !== undefined ? (req.body.solid ? 1 : 0) : current.solid ? 1 : 0,
    focus_minutes: Math.min(180, Math.max(5, num(req.body?.focus_minutes ?? current.focus_minutes) ?? 25)),
    break_minutes: Math.min(60, Math.max(1, num(req.body?.break_minutes ?? current.break_minutes) ?? 5)),
    notify: JSON.stringify(req.body?.notify ?? safeJson(current.notify)),
  };
  run(
    `UPDATE settings SET theme = ?, wall = ?, glass = ?, accent = ?, solid = ?, focus_minutes = ?, break_minutes = ?, notify = ?
      WHERE user_id = ?`,
    next.theme, next.wall, next.glass, next.accent, next.solid, next.focus_minutes, next.break_minutes, next.notify, actor.id,
  );
  res.json({ ok: true });
});

/**
 * Save an avatar. The browser downscales to 256px and sends a data URL, so the
 * server never needs an image library: validate the magic bytes, cap the size,
 * write the file, bump a version string so the <img> cache busts.
 */
api.post("/profile/avatar", requireUser, (req, res) => {
  const actor = me(req);
  const dataUrl = typeof req.body?.data_url === "string" ? req.body.data_url : "";
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: "Send a PNG, JPEG or WebP image." });
  const [, ext, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 64) return res.status(400).json({ error: "That image looks empty." });
  if (bytes.length > 300_000) return res.status(413).json({ error: "Keep the image under 300 KB." });

  // Trust the magic bytes, not the declared mime type.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!(isPng || isJpeg || isWebp)) return res.status(400).json({ error: "That file is not a real image." });

  // One file per user, so replacing a photo cannot leave orphans behind.
  for (const stale of ["png", "jpeg", "webp"]) {
    const path = join(avatarDir, `${actor.id}.${stale}`);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch {}
    }
  }
  writeFileSync(join(avatarDir, `${actor.id}.${ext}`), bytes);
  const version = String(Date.now());
  run("UPDATE users SET avatar = ? WHERE id = ?", version, actor.id);
  res.status(201).json({ ok: true, avatar: version });
});

api.delete("/profile/avatar", requireUser, (req, res) => {
  const actor = me(req);
  for (const ext of ["png", "jpeg", "webp"]) {
    const path = join(avatarDir, `${actor.id}.${ext}`);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch {}
    }
  }
  run("UPDATE users SET avatar = '' WHERE id = ?", actor.id);
  res.json({ ok: true });
});

/**
 * Serve an avatar. Behind requireUser because a photo is only for teammates;
 * the version in the URL lets the browser cache it forever.
 */
api.get("/avatars/:id", requireUser, (req, res) => {
  const actor = me(req);
  const id = String(req.params.id);
  if (!row("SELECT 1 AS ok FROM memberships WHERE user_id = ? AND workspace_id = ?", id, actor.workspace_id)) {
    return res.status(404).end();
  }
  for (const [ext, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]] as const) {
    const path = join(avatarDir, `${id}.${ext}`);
    if (existsSync(path)) {
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      return res.end(readFileSync(path));
    }
  }
  res.status(404).end();
});

/* ----------------------------- calendar feed ----------------------------- */

/** ICS text escaping, per RFC 5545 section 3.3.11. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold to 75 octets per line, continuing with a single leading space. */
function icsFold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character: back off to a UTF-8 boundary.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((start === 0 ? "" : " ") + bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return out.join("\r\n");
}

/**
 * Read-only feed so Google Calendar (or any ICS client) can subscribe.
 * starts_at is stored as naive local time, which is exactly what an ICS value
 * without a Z suffix or TZID means: floating local time.
 */
function buildCalendar(workspaceId: string, workspaceName: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = rows<{ id: string; title: string; starts_at: string; duration_min: number; location: string; kind: string }>(
    "SELECT id, title, starts_at, duration_min, location, kind FROM events WHERE workspace_id = ? ORDER BY starts_at",
    workspaceId,
  );
  const dueTasks = rows<{ id: string; title: string; due_date: string; status: string }>(
    "SELECT id, title, due_date, status FROM tasks WHERE workspace_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL",
    workspaceId,
  );

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lucent//Workspace//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(workspaceName)}`,
  ];

  const pad = (n: number) => String(n).padStart(2, "0");

  /**
   * Stored value is naive local "YYYY-MM-DDTHH:mm"; ICS wants "YYYYMMDDTHHMMSS".
   * Seconds are not stored, so they are always 00.
   */
  const compact = (value: string) => {
    const [day, time = "00:00"] = value.split("T");
    const [hour, minute = "00"] = time.split(":");
    return `${day.replace(/-/g, "")}T${pad(Number(hour))}${pad(Number(minute))}00`;
  };

  /**
   * Add minutes in LOCAL time. Building the Date from components and reading it
   * back the same way keeps it floating; toISOString would shift it to UTC.
   */
  const addMinutes = (value: string, minutes: number) => {
    const [day, time = "00:00"] = value.split("T");
    const [year, month, date] = day.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const shifted = new Date(year, month - 1, date, hour, minute + minutes);
    return `${shifted.getFullYear()}${pad(shifted.getMonth() + 1)}${pad(shifted.getDate())}`
      + `T${pad(shifted.getHours())}${pad(shifted.getMinutes())}00`;
  };

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@lucent`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compact(event.starts_at)}`,
      `DTEND:${addMinutes(event.starts_at, event.duration_min || 30)}`,
      `SUMMARY:${icsText(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
    lines.push(`CATEGORIES:${icsText(event.kind)}`, "END:VEVENT");
  }

  // Task due dates appear on the app's calendar too, so carry them across as
  // all-day events rather than letting the feed disagree with the product.
  for (const task of dueTasks) {
    const day = task.due_date.slice(0, 10).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:task-${task.id}@lucent`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `SUMMARY:${icsText(`Due: ${task.title}`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/**
 * Public, token-guarded feed. It deliberately skips requireUser: Google fetches
 * this URL with no cookie. The token is per-user and revocable.
 */
api.get("/calendar.ics", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) return res.status(401).json({ error: "A calendar token is required." });
  const owner = row<{ workspace_id: string; workspace_name: string }>(
    `SELECT m.workspace_id, w.name AS workspace_name
       FROM users u JOIN memberships m ON m.user_id = u.id JOIN workspaces w ON w.id = m.workspace_id
      WHERE u.calendar_token = ?`,
    token,
  );
  if (!owner) return res.status(401).json({ error: "That calendar token is not valid." });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="lucent.ics"');
  res.setHeader("Cache-Control", "no-cache");
  res.end(buildCalendar(owner.workspace_id, owner.workspace_name));
});

/** Mint (or rotate) the feed token for the signed-in user. */
api.post("/calendar/token", requireUser, (req, res) => {
  const actor = me(req);
  const token = randomBytes(24).toString("base64url");
  run("UPDATE users SET calendar_token = ? WHERE id = ?", token, actor.id);
  res.status(201).json({ token });
});

api.delete("/calendar/token", requireUser, (req, res) => {
  const actor = me(req);
  run("UPDATE users SET calendar_token = NULL WHERE id = ?", actor.id);
  res.json({ ok: true });
});

/* -------------------------- google calendar import ------------------------ */

/** What the Calendar page needs to show the connection state. */
api.get("/calendar/google", requireUser, (req, res) => {
  const actor = me(req);
  const found = row<{
    google_calendar_url: string | null;
    google_calendar_synced_at: string | null;
    google_calendar_error: string;
  }>(
    "SELECT google_calendar_url, google_calendar_synced_at, google_calendar_error FROM users WHERE id = ?",
    actor.id,
  );
  const count = row<{ n: number }>(
    "SELECT COUNT(*) AS n FROM external_events WHERE user_id = ?", actor.id,
  );
  res.json({
    connected: Boolean(found?.google_calendar_url),
    masked: found?.google_calendar_url ? maskFeedUrl(found.google_calendar_url) : "",
    last_sync: found?.google_calendar_synced_at ?? null,
    error: found?.google_calendar_error ?? "",
    event_count: count?.n ?? 0,
  });
});

/**
 * Connect a Google calendar by its secret iCal address. The feed is fetched straight
 * away so a wrong address is rejected while the person is still looking at the form,
 * rather than failing silently on the next background refresh.
 */
api.post("/calendar/google", requireUser, async (req, res) => {
  const actor = me(req);
  let url: string;
  try {
    url = validateFeedUrl(req.body?.url);
  } catch (error) {
    if (error instanceof FeedError) return res.status(400).json({ error: error.message });
    throw error;
  }

  try {
    const count = await syncUser(actor.id, url);
    run("UPDATE users SET google_calendar_url = ? WHERE id = ?", url, actor.id);
    return res.status(201).json({ ok: true, event_count: count });
  } catch (error) {
    if (error instanceof FeedError) {
      // Do not store a URL that does not work.
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

/** Refresh on demand, for the Sync button. */
api.post("/calendar/google/sync", requireUser, async (req, res) => {
  const actor = me(req);
  const found = row<{ google_calendar_url: string | null }>(
    "SELECT google_calendar_url FROM users WHERE id = ?", actor.id,
  );
  if (!found?.google_calendar_url) return res.status(400).json({ error: "No Google calendar is connected." });
  try {
    const count = await syncUser(actor.id, found.google_calendar_url);
    res.json({ ok: true, event_count: count });
  } catch (error) {
    if (error instanceof FeedError) {
      run("UPDATE users SET google_calendar_error = ? WHERE id = ?", error.message, actor.id);
      return res.status(502).json({ error: error.message });
    }
    throw error;
  }
});

api.delete("/calendar/google", requireUser, (req, res) => {
  gcalDisconnect(me(req).id);
  res.json({ ok: true });
});

/** Imported events for a visible range, so the calendar does not bloat /bootstrap. */
api.get("/calendar/google/events", requireUser, (req, res) => {
  const actor = me(req);
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "from and to must be ISO dates." });
  }
  // A range wider than a year is a client bug, not a request worth serving.
  if (toDate.getTime() - fromDate.getTime() > 400 * 86_400_000) {
    return res.status(400).json({ error: "That range is too wide." });
  }
  res.json({
    events: eventsBetween(actor.id, fromDate.toISOString(), toDate.toISOString()),
  });
});

api.patch("/profile", requireUser, (req, res) => {
  const actor = me(req);
  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 160).toLowerCase();
  const role = text(req.body?.role, 80);
  const team = text(req.body?.team, 40);
  if (name.length < 2) return res.status(400).json({ error: "Your name can’t be empty." });
  if (!emailRe.test(email)) return res.status(400).json({ error: "That email doesn’t look right." });
  if (team && !row("SELECT 1 AS ok FROM teams WHERE workspace_id = ? AND lower(name) = lower(?)",
                   actor.workspace_id, team)) {
    return res.status(400).json({ error: "Pick a team that exists in this workspace." });
  }
  const clash = row("SELECT 1 AS ok FROM users WHERE email = ? AND id != ?", email, actor.id);
  if (clash) return res.status(409).json({ error: "That email is already in use." });
  // An omitted team keeps the current one; the name is stored as the team spells it.
  const resolved = team
    ? row<{ name: string }>("SELECT name FROM teams WHERE workspace_id = ? AND lower(name) = lower(?)",
                            actor.workspace_id, team)?.name ?? team
    : actor.team;
  run("UPDATE users SET name = ?, email = ?, role = ?, team = ? WHERE id = ?",
      name, email, role || actor.role, resolved, actor.id);
  res.json({ ok: true });
});

/* ------------------------------ notifications ---------------------------- */

api.post("/notifications/read", requireUser, (req, res) => {
  const actor = me(req);
  const ids: string[] = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((v: unknown) => typeof v === "string").slice(0, 500)
    : [];
  if (ids.length) {
    run(
      `INSERT OR IGNORE INTO notification_reads (user_id, notification_id)
       SELECT ?, id FROM notifications WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
      actor.id, actor.workspace_id, ...ids,
    );
  } else {
    run(
      `INSERT OR IGNORE INTO notification_reads (user_id, notification_id)
       SELECT ?, id FROM notifications WHERE workspace_id = ?`,
      actor.id, actor.workspace_id,
    );
  }
  res.json({ ok: true });
});

/* ---------------------------------- team --------------------------------- */

api.post("/members", requireUser, async (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can invite people." });
  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 160).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: "Please enter a name." });
  if (!emailRe.test(email)) return res.status(400).json({ error: "That email doesn’t look right." });
  if (row("SELECT 1 AS ok FROM users WHERE email = ?", email)) {
    return res.status(409).json({ error: "Someone with that email is already here." });
  }
  const teamName = text(req.body?.team, 40) || "Product";
  if (!row("SELECT 1 AS ok FROM teams WHERE workspace_id = ? AND name = ?", actor.workspace_id, teamName)) {
    return res.status(400).json({ error: "Pick a team that exists in this workspace." });
  }
  const id = uid();
  const temporaryPassword = randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);
  tx(() => {
    run(
      `INSERT INTO users (id, email, name, password_hash, role, team, location, tz_offset, hue, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, email, name, passwordHash, text(req.body?.role, 80) || "Team member",
      teamName, text(req.body?.location, 80),
      Math.min(840, Math.max(-720, num(req.body?.tz_offset) ?? 0)),
      Math.floor(Math.random() * 360), nowIso(),
    );
    run("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, 'member')", id, actor.workspace_id);
    run("INSERT INTO settings (user_id) VALUES (?)", id);
    logActivity(actor.workspace_id, actor.id, "invited", name, "/team");
  });
  res.status(201).json({ id, temporary_password: temporaryPassword });
});

/**
 * Remove someone from the workspace. Their tasks survive with the assignee
 * cleared (ON DELETE SET NULL), so no work disappears with the person.
 * Two guards: you cannot remove yourself, and you cannot remove the last admin.
 */
api.delete("/members/:id", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can remove people." });
  const targetId = String(req.params.id);
  const target = row<{ id: string; name: string; role: string; is_admin: number }>(
    `SELECT u.id, u.name, m.role, m.role = 'admin' AS is_admin
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ? AND m.workspace_id = ?`,
    targetId, actor.workspace_id,
  );
  if (!target) return res.status(404).json({ error: "That person isn’t in this workspace." });
  if (target.id === actor.id) return res.status(400).json({ error: "You can’t remove yourself." });
  if (target.is_admin) {
    const admins = row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = 'admin'", actor.workspace_id,
    );
    if ((admins?.n ?? 0) <= 1) return res.status(400).json({ error: "A workspace needs at least one admin." });
  }

  tx(() => {
    run("DELETE FROM memberships WHERE user_id = ? AND workspace_id = ?", targetId, actor.workspace_id);
    run("DELETE FROM sessions WHERE user_id = ?", targetId);
    // A user row with no membership anywhere is unreachable; drop it so the
    // email can be invited again later.
    if (!row("SELECT 1 AS ok FROM memberships WHERE user_id = ?", targetId)) {
      run("DELETE FROM users WHERE id = ?", targetId);
    }
    logActivity(actor.workspace_id, actor.id, "removed", target.name, "/team");
  });
  res.json({ ok: true });
});

/**
 * Admin-only: change someone's details. Admins can fix a misspelled name, move a
 * person between teams, correct their job title, or promote and demote them.
 *
 * Two guards keep an admin from locking the workspace: you cannot take away your own
 * admin rights while you are the only admin, and the last admin cannot be demoted.
 */
api.patch("/members/:id", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can change people." });
  const targetId = String(req.params.id);
  const target = row<{ id: string; name: string; email: string; is_admin: number }>(
    `SELECT u.id, u.name, u.email, m.role = 'admin' AS is_admin
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ? AND m.workspace_id = ?`,
    targetId, actor.workspace_id,
  );
  if (!target) return res.status(404).json({ error: "That person isn’t in this workspace." });

  // Only the fields actually present in the body are touched, so a caller can change
  // one thing without having to resend the rest.
  const has = (key: string) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);

  let name = target.name;
  if (has("name")) {
    name = text(req.body.name, 80);
    if (name.length < 2) return res.status(400).json({ error: "Please enter a name." });
  }

  let email = target.email;
  if (has("email")) {
    email = text(req.body.email, 160).toLowerCase();
    if (!emailRe.test(email)) return res.status(400).json({ error: "That email doesn’t look right." });
    const clash = row<{ id: string }>("SELECT id FROM users WHERE email = ? AND id <> ?", email, targetId);
    if (clash) return res.status(409).json({ error: "Someone with that email is already here." });
  }

  let team: string | null = null;
  if (has("team")) {
    team = text(req.body.team, 40);
    if (!row("SELECT 1 AS ok FROM teams WHERE workspace_id = ? AND name = ?", actor.workspace_id, team)) {
      return res.status(400).json({ error: "Pick a team that exists in this workspace." });
    }
  }

  const role = has("role") ? text(req.body.role, 80) : null;
  const location = has("location") ? text(req.body.location, 80) : null;
  const tz = has("tz_offset") ? Math.min(840, Math.max(-720, num(req.body.tz_offset) ?? 0)) : null;

  // Promotion and demotion. The admin role lives on the membership, not the user.
  let workspaceRole: "admin" | "member" | null = null;
  if (has("workspace_role")) {
    const wanted = text(req.body.workspace_role, 10);
    if (wanted !== "admin" && wanted !== "member") {
      return res.status(400).json({ error: "A person is either an admin or a member." });
    }
    workspaceRole = wanted;
  }
  if (workspaceRole === "member" && target.is_admin) {
    const admins = row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = 'admin'", actor.workspace_id,
    );
    if ((admins?.n ?? 0) <= 1) {
      return res.status(400).json({ error: "A workspace needs at least one admin." });
    }
  }

  tx(() => {
    run(
      `UPDATE users SET name = ?, email = ?, role = COALESCE(?, role), team = COALESCE(?, team),
              location = COALESCE(?, location), tz_offset = COALESCE(?, tz_offset)
        WHERE id = ?`,
      name, email, role, team, location, tz, targetId,
    );
    if (workspaceRole) {
      run("UPDATE memberships SET role = ? WHERE user_id = ? AND workspace_id = ?",
        workspaceRole, targetId, actor.workspace_id);
      // Demoting someone must not leave their old session holding admin powers.
      run("DELETE FROM sessions WHERE user_id = ?", targetId);
    }
    logActivity(actor.workspace_id, actor.id, "updated", name, "/team");
  });
  res.json({ ok: true });
});

/* --------------------------------- teams --------------------------------- */

/** Admin-only: add a team so it appears in the invite picker and the filters. */
api.post("/teams", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can add teams." });
  const name = text(req.body?.name, 40);
  if (name.length < 2) return res.status(400).json({ error: "Give the team a name." });
  if (row("SELECT 1 AS ok FROM teams WHERE workspace_id = ? AND lower(name) = lower(?)", actor.workspace_id, name)) {
    return res.status(409).json({ error: "That team already exists." });
  }
  const id = uid();
  const position = row<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM teams WHERE workspace_id = ?", actor.workspace_id)?.n ?? 0;
  run(
    "INSERT INTO teams (id, workspace_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
    id, actor.workspace_id, name, position, nowIso(),
  );
  logActivity(actor.workspace_id, actor.id, "created team", name, "/team");
  res.status(201).json({ id, name });
});

/**
 * Admin-only: delete a team. Members are not silently reassigned, because that
 * would move people somewhere nobody chose. Pass ?move_to=<teamId> to move them,
 * or empty the team first.
 */
api.delete("/teams/:id", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can delete teams." });
  const team = row<{ id: string; name: string }>(
    "SELECT id, name FROM teams WHERE id = ? AND workspace_id = ?", String(req.params.id), actor.workspace_id,
  );
  if (!team) return res.status(404).json({ error: "That team isn’t in this workspace." });

  const memberIds = rows<{ id: string }>(
    "SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.workspace_id = ? AND u.team = ?",
    actor.workspace_id, team.name,
  ).map((r) => r.id);

  const moveToId = idOf(req.query.move_to);
  if (memberIds.length && !moveToId) {
    return res.status(400).json({
      error: `That team still has ${memberIds.length} ${memberIds.length === 1 ? "person" : "people"}. Move them to another team first.`,
      member_count: memberIds.length,
    });
  }

  let moveTo: { id: string; name: string } | undefined;
  if (moveToId) {
    moveTo = row<{ id: string; name: string }>(
      "SELECT id, name FROM teams WHERE id = ? AND workspace_id = ?", moveToId, actor.workspace_id,
    );
    if (!moveTo) return res.status(400).json({ error: "Pick a team in this workspace to move people to." });
    if (moveTo.id === team.id) return res.status(400).json({ error: "You can’t move people into the team you’re deleting." });
  }

  tx(() => {
    if (moveTo) {
      for (const id of memberIds) run("UPDATE users SET team = ? WHERE id = ?", moveTo.name, id);
    }
    run("DELETE FROM teams WHERE id = ?", team.id);
    logActivity(
      actor.workspace_id, actor.id, "deleted team", team.name, "/team",
    );
  });
  res.json({ ok: true, moved: moveTo ? memberIds.length : 0 });
});

/* -------------------------------- insights ------------------------------- */

api.get("/insights", requireUser, (req, res) => {
  const actor = me(req);
  const range = oneOf(String(req.query.range ?? "30"), ["7", "30", "90"] as const, "30");
  res.json(buildInsights(actor.workspace_id, Number(range) as 7 | 30 | 90));
});

/* --------------------------------- focus --------------------------------- */

api.post("/focus", requireUser, (req, res) => {
  const actor = me(req);
  const taskId = idOf(req.body?.task_id);
  if (taskId) assertInWorkspace("tasks", taskId, actor.workspace_id);
  const minutes = Math.min(240, Math.max(1, num(req.body?.minutes) ?? 25));
  const ended = nowIso();
  run(
    "INSERT INTO focus_sessions (id, user_id, task_id, minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
    uid(), actor.id, taskId, minutes, new Date(Date.now() - minutes * 60_000).toISOString(), ended,
  );
  res.status(201).json({ ok: true });
});

/* --------------------------------- export -------------------------------- */

api.get("/export.csv", requireUser, (req, res) => {
  const actor = me(req);
  const taskRows = rows<Record<string, unknown>>(
    `SELECT t.title, p.name AS project, t.status, t.priority, u.name AS assignee,
            t.due_date, t.estimate, t.created_at, t.done_at
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.workspace_id = ? AND t.archived = 0 ORDER BY t.created_at`,
    actor.workspace_id,
  );
  const header = ["title", "project", "status", "priority", "assignee", "due", "estimate", "created", "done"];
  // A leading = + - @ tab or CR would make spreadsheet software evaluate the cell.
  const escape = (value: unknown) => {
    const raw = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [header.join(","), ...taskRows.map((t) => Object.values(t).map(escape).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="lucent-tasks-${isoDay()}.csv"`);
  res.send(csv);
});

/* ---------------------------------- reset -------------------------------- */

api.post("/reset", requireUser, (req, res) => {
  const actor = me(req);
  if (!actor.is_admin) return res.status(403).json({ error: "Only workspace admins can reset the sample data." });
  resetWorkspace(actor.workspace_id);
  res.json({ ok: true });
});
