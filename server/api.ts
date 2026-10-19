import { Router } from "express";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { row, rows, run, uid, nowIso, tx, isoDay } from "./db.js";
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
  if (!OPEN_REGISTRATION) {
    return res.status(403).json({ error: "Registration is closed. Ask a workspace admin for an invite." });
  }

  const id = uid();
  const passwordHash = await hashPassword(password);
  const hue = Math.floor(Math.random() * 360);

  tx(() => {
    let workspace = row<{ id: string }>("SELECT id FROM workspaces ORDER BY created_at LIMIT 1");
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

/* ------------------------------- bootstrap ------------------------------- */

api.get("/bootstrap", requireUser, (req, res) => {
  const actor = me(req);
  const workspaceId = actor.workspace_id;

  const members = rows(
    `SELECT u.id, u.name, u.email, u.role, u.team, u.location, u.tz_offset, u.hue, m.role AS workspace_role
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

  res.json({
    me: actor,
    workspace: { id: workspaceId, name: actor.workspace_name },
    members,
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

api.patch("/profile", requireUser, (req, res) => {
  const actor = me(req);
  const name = text(req.body?.name, 80);
  const email = text(req.body?.email, 160).toLowerCase();
  const role = text(req.body?.role, 80);
  if (name.length < 2) return res.status(400).json({ error: "Your name can’t be empty." });
  if (!emailRe.test(email)) return res.status(400).json({ error: "That email doesn’t look right." });
  const clash = row("SELECT 1 AS ok FROM users WHERE email = ? AND id != ?", email, actor.id);
  if (clash) return res.status(409).json({ error: "That email is already in use." });
  run("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?", name, email, role || actor.role, actor.id);
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
  const id = uid();
  const temporaryPassword = randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);
  tx(() => {
    run(
      `INSERT INTO users (id, email, name, password_hash, role, team, location, tz_offset, hue, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, email, name, passwordHash, text(req.body?.role, 80) || "Team member",
      text(req.body?.team, 40) || "Product", text(req.body?.location, 80),
      Math.min(840, Math.max(-720, num(req.body?.tz_offset) ?? 0)),
      Math.floor(Math.random() * 360), nowIso(),
    );
    run("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, 'member')", id, actor.workspace_id);
    run("INSERT INTO settings (user_id) VALUES (?)", id);
    logActivity(actor.workspace_id, actor.id, "invited", name, "/team");
  });
  res.status(201).json({ id, temporary_password: temporaryPassword });
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
