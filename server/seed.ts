import { run, nowIso, uid, row, rows, tx } from "./db.js";
import { hashPassword } from "./auth.js";

export const DEMO_PASSWORD = "demo1234";

const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const at = (offset: number, hour: number, minute = 0) => `${day(offset)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const stamp = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

type Person = [name: string, email: string, role: string, team: string, location: string, tz: number, hue: number];

const people: Person[] = [
  ["Maya Chen", "maya@lucent.app", "Product Lead", "Product", "London, UK", 0, 212],
  ["Nia Okoro", "nia@lucent.app", "Design Lead", "Design", "Lagos, NG", 60, 288],
  ["Elise Marchand", "elise@lucent.app", "Product Designer", "Design", "Lyon, FR", 60, 336],
  ["Kwame Asante", "kwame@lucent.app", "iOS Engineer", "Engineering", "Accra, GH", 0, 24],
  ["Peter Lund", "peter@lucent.app", "Engineering Manager", "Engineering", "Copenhagen, DK", 60, 190],
  ["Freya Nilsen", "freya@lucent.app", "Brand Designer", "Design", "Bergen, NO", 60, 158],
  ["Omar Saleh", "omar@lucent.app", "Backend Engineer", "Engineering", "Amman, JO", 180, 96],
  ["Haruto Sato", "haruto@lucent.app", "Frontend Engineer", "Engineering", "Tokyo, JP", 540, 12],
  ["Inés Duarte", "ines@lucent.app", "Marketing Lead", "Marketing", "Lisbon, PT", 0, 340],
  ["Vikram Nair", "vikram@lucent.app", "Data Analyst", "Product", "Bengaluru, IN", 330, 262],
  ["Camila Ortiz", "camila@lucent.app", "Content Strategist", "Marketing", "Mexico City, MX", -360, 30],
  ["Malik Johnson", "malik@lucent.app", "QA Engineer", "Engineering", "Atlanta, US", -300, 174],
];

type Project = [name: string, description: string, status: string, color: string, due: number, lead: number, pinned: number];

const projects: Project[] = [
  ["Tide mobile app", "The 3.0 rebuild: a calmer home, offline sync and onboarding that respects your attention.", "active", "blue", 40, 3, 1],
  ["Facet design system", "One set of tokens, components and docs for every surface, in light and dark.", "active", "purple", 60, 1, 0],
  ["Orbit 2.0 launch", "Everything the public sees on launch day: site, film, press kit and the waitlist email.", "active", "orange", 12, 8, 1],
  ["Sprout onboarding", "A first-week path that gets new teams to their first finished project.", "review", "green", 5, 0, 0],
  ["Q4 brand campaign", "Out-of-home and social for the winter season, built around “work you can see through”.", "planning", "pink", 68, 5, 0],
  ["Northstar analytics", "One trusted metric per team and a weekly digest everyone actually opens.", "shipped", "teal", -12, 9, 0],
];

type Task = [
  title: string,
  project: number,
  status: "todo" | "in_progress" | "in_review" | "done",
  priority: "none" | "low" | "medium" | "high" | "urgent",
  assignee: number,
  due: number,
  estimate: number,
  subtasks?: [number, number],
  comment?: string,
];

const tasks: Task[] = [
  ["Moodboard round one", 4, "todo", "none", 5, 52, 6],
  ["Media plan budget", 4, "todo", "none", 10, 28, 4],
  ["Agency shortlist", 4, "todo", "none", 1, 47, 3, [1, 3]],
  ["Campaign line options", 4, "todo", "high", 5, 33, 5],
  ["Photography call sheet", 4, "todo", "urgent", 8, 4, 2, undefined, "Waiting on the studio to confirm the second room."],
  ["Launch-day run of show", 4, "todo", "high", 9, 6, 3],
  ["Founder blog post", 4, "todo", "high", 0, 4, 4, [1, 3], "First draft reads well. Needs a sharper opening."],
  ["Press kit approvals", 2, "todo", "urgent", 0, 0, 2],
  ["Pricing page FAQ", 2, "in_review", "none", 8, 7, 2, undefined, "Legal flagged one line about annual billing."],
  ["Product Hunt assets", 2, "in_review", "high", 10, 2, 4, [2, 3]],
  ["Partner quotes sign-off", 2, "in_progress", "high", 5, 1, 2],
  ["Launch film final cut", 2, "in_progress", "urgent", 2, 4, 8],
  ["Waitlist email sequence", 2, "todo", "none", 10, 9, 3],
  ["Menu + context menu", 1, "todo", "none", 7, 23, 3],
  ["Avatar stack", 1, "todo", "none", 7, 24, 2],
  ["Motion guidelines page", 1, "in_progress", "none", 2, 5, 6],
  ["Component usage analytics", 1, "in_progress", "none", 2, 16, 5, [2, 3], "Events are flowing, still need a readable summary."],
  ["Date picker", 1, "in_review", "none", 5, 10, 4, [2, 3]],
  ["Token export to iOS", 1, "in_review", "urgent", 1, 22, 3],
  ["Docs search", 1, "todo", "none", 1, 30, 5],
  ["Image cache eviction", 0, "todo", "high", 3, 0, 5, [1, 3]],
  ["Pull-to-refresh spring", 0, "todo", "high", 2, 0, 3, undefined, "Feels too bouncy on older devices."],
  ["Crash on cold launch", 0, "in_progress", "none", 6, 14, 8, [2, 3], "Reproduced on iOS 18.2, narrowing it to the session restore path."],
  ["Settings search", 0, "in_progress", "none", 11, 5, 4],
  ["Onboarding copy review", 0, "in_progress", "high", 3, 24, 2],
  ["Release checklist", 0, "in_progress", "high", 0, 0, 3],
  ["Accessibility audit: Dynamic Type", 0, "in_review", "none", 7, 24, 5],
  ["Push notification permissions", 0, "in_review", "urgent", 2, 24, 4],
  ["Invite flow friction log", 3, "in_review", "urgent", 0, 0, 3],
  ["Read-out deck", 3, "in_review", "high", 9, 0, 5, [2, 3]],
  ["Day-3 nudge email", 3, "in_progress", "urgent", 2, 2, 3, undefined, "Subject line test is still running."],
  ["Write read-out summary", 3, "in_progress", "high", 0, 0, 4],
  ["Share sprint notes", 5, "done", "none", 0, 0, 1],
  ["Answer sync edge case", 5, "done", "none", 0, 0, 2],
  ["Build offline queue", 0, "done", "none", 3, -9, 8, [3, 3]],
  ["Profile empty states", 0, "done", "none", 3, -10, 3, [3, 3]],
  ["Haptics pass", 0, "done", "none", 7, -10, 2],
  ["Release notes 3.0", 0, "done", "none", 3, -14, 2, undefined, "Shipped with the beta announcement."],
  ["Activation funnel dashboard", 3, "done", "none", 2, -14, 6, undefined, "Leadership asked for a weekly view of this."],
  ["Template gallery picks", 3, "done", "none", 1, -14, 4, [3, 3]],
  ["Weekly digest email", 5, "done", "none", 9, -20, 4],
  ["Metric definitions doc", 5, "done", "none", 9, -25, 5],
];

type EventSeed = [title: string, dayOffset: number, hour: number, duration: number, location: string, kind: string];

const events: EventSeed[] = [
  ["Quarterly planning", -21, 10, 90, "Board room", "meeting"],
  ["Metrics review", -14, 14, 45, "Video call", "review"],
  ["Design critique", -7, 15, 45, "Studio", "review"],
  ["Customer call: Halvard", -5, 9, 30, "Video call", "meeting"],
  ["Retro", -3, 16, 60, "Studio", "team"],
  ["Stand-up", 0, 9, 15, "Huddle room", "team"],
  ["Tide sync review", 0, 11, 45, "Video call", "meeting"],
  ["Lunch & learn: glass materials", 0, 12, 60, "Kitchen", "team"],
  ["Deep work", 0, 14, 90, "Focus block", "focus"],
  ["Launch film cut", 0, 16, 30, "Studio B", "review"],
  ["Design critique", 1, 15, 45, "Studio", "review"],
  ["1:1 with Peter", 1, 16, 30, "Video call", "meeting"],
  ["Offline sync demo", 2, 11, 45, "Video call", "review"],
  ["Brand brief kickoff", 3, 10, 60, "Board room", "meeting"],
  ["Launch film final", 4, 14, 60, "Studio B", "review"],
  ["Sprout read-out", 7, 10, 45, "Video call", "review"],
  ["Offline sync in beta", 8, 9, 30, "Video call", "meeting"],
  ["Quarterly planning", 9, 10, 90, "Board room", "meeting"],
  ["Hiring panel", 10, 13, 60, "Room 4", "meeting"],
  ["Offsite", 15, 9, 480, "Riverside", "team"],
  ["Press embargo lifts", 17, 9, 15, "", "meeting"],
];

type MilestoneSeed = [project: number, title: string, due: number, done: number];
const milestones: MilestoneSeed[] = [
  [0, "Navigation prototype signed off", -20, 1],
  [0, "Offline sync in beta", 6, 0],
  [0, "TestFlight to 500 users", 15, 0],
  [0, "App Store release", 40, 0],
  [1, "Token audit complete", -10, 1],
  [1, "Docs site live", 18, 0],
  [1, "Mobile component parity", 40, 0],
  [2, "Film final cut", 4, 0],
  [2, "Press kit approved", 8, 0],
  [2, "Launch day", 12, 0],
  [3, "Read-out to leadership", 5, 0],
  [3, "First-week metrics", 20, 0],
  [4, "Creative brief", 10, 0],
  [4, "Production begins", 30, 0],
  [5, "Every milestone met", -12, 1],
];

const activity: [person: number, verb: string, subject: string, minutesAgo: number][] = [
  [3, "moved", "Accessibility audit: Dynamic Type to In review", 25],
  [6, "finished a 50-minute focus session", "", 120],
  [2, "completed", "Profile empty states", 180],
  [4, "scheduled", "Offline sync demo", 1200],
  [1, "commented on", "Date picker", 1400],
  [8, "approved", "Press kit approvals", 1600],
  [9, "published", "Weekly digest email", 2100],
  [0, "created", "Release checklist", 2600],
];

function seedContent(workspaceId: string, userIds: string[]) {
  const projectIds: string[] = [];
  projects.forEach(([name, description, status, color, due, lead, pinned], index) => {
    const id = uid();
    projectIds.push(id);
    run(
      `INSERT INTO projects (id, workspace_id, name, description, status, color, due_date, lead_id, pinned, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, workspaceId, name, description, status, color, day(due), userIds[lead], pinned, index, nowIso(),
    );
  });

  milestones.forEach(([project, title, due, done], index) => {
    run(
      "INSERT INTO milestones (id, project_id, title, due_date, done, position) VALUES (?, ?, ?, ?, ?, ?)",
      uid(), projectIds[project], title, day(due), done, index,
    );
  });

  tasks.forEach(([title, project, status, priority, assignee, due, estimate, subtaskSpec, comment], index) => {
    const id = uid();
    const created = stamp(4000 - index * 40);
    const late = index % 4 === 1;
    const doneAt = status === "done" ? at(due + (late ? 2 : 0), late ? 11 : 17) : null;
    run(
      `INSERT INTO tasks (id, workspace_id, project_id, title, status, priority, assignee_id, due_date, estimate, position, created_by, created_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, workspaceId, projectIds[project], title, status, priority, userIds[assignee],
      day(due), estimate, index, userIds[0],
      doneAt && doneAt < created ? `${at(due - 4, 9)}` : created,
      doneAt,
    );

    if (subtaskSpec) {
      const [doneCount, total] = subtaskSpec;
      ["Draft", "Review", "Ship"].slice(0, total).forEach((label, i) => {
        run(
          "INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)",
          uid(), id, `${label}: ${title}`, i < doneCount ? 1 : 0, i,
        );
      });
    }

    if (comment) {
      run(
        "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
        uid(), id, userIds[(assignee + 2) % userIds.length], comment, stamp(600 + index * 17),
      );
    }
  });

  events.forEach(([title, offset, hour, duration, location, kind]) => {
    run(
      `INSERT INTO events (id, workspace_id, title, starts_at, duration_min, location, kind, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      uid(), workspaceId, title, at(offset, hour), duration, location, kind,
      userIds[(((offset + 20) % userIds.length) + userIds.length) % userIds.length],
    );
  });

  activity.forEach(([person, verb, subject, minutesAgo]) => {
    run(
      "INSERT INTO activity (id, workspace_id, user_id, verb, subject, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      uid(), workspaceId, userIds[person], verb, subject, "", stamp(minutesAgo),
    );
  });

  const notifications: [kind: string, title: string, body: string, href: string][] = [
    ["mention", "Nia mentioned you", "“Can you look at the rim gradient on the light theme?”", "/tasks"],
    ["due", "Two tasks are due today", "Release checklist and Write read-out summary", "/tasks"],
    ["meeting", "Tide sync review starts soon", "11:00 · Video call", "/calendar"],
  ];
  notifications.forEach(([kind, title, body, href], i) => {
    run(
      "INSERT INTO notifications (id, workspace_id, user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      uid(), workspaceId, null, kind, title, body, href, stamp(30 + i * 90),
    );
  });

  run(
    "INSERT INTO focus_sessions (id, user_id, task_id, minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
    uid(), userIds[0], null, 25, stamp(300), stamp(275),
  );
  run(
    "INSERT INTO focus_sessions (id, user_id, task_id, minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
    uid(), userIds[0], null, 50, stamp(180), stamp(130),
  );
  run(
    "INSERT INTO focus_sessions (id, user_id, task_id, minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
    uid(), userIds[0], null, 15, stamp(90), stamp(75),
  );

  // History: insights needs a month of finished work and focus time to read like a real team.
  // Kept off the current week so the home chart stays as sparse as a Monday morning.
  const history: string[] = [
    "Ship empty states", "Tune rim gradient", "Fix nav lens easing", "Write release notes", "Audit contrast",
    "Trim onboarding copy", "Polish focus ring", "Split settings route", "Reduce bundle size", "Refresh icon set",
    "Fix drag preview", "Add offline banner", "Rewrite empty week", "Sync calendar dots", "Review pull request",
    "Clean up tokens", "Tighten card radius", "Test iOS 18 build", "Draft press kit", "Update changelog",
    "Triage bug reports", "Document API fields", "Compress hero image", "Fix date offsets", "Rename components",
    "Land dark theme", "Add keyboard hints", "Refine table sort", "Cache bootstrap", "Check mobile nav",
  ];
  let seedState = 7;
  const pick = (n: number) => {
    seedState = (seedState * 1103515245 + 12345) % 2147483648;
    return Math.floor((seedState / 2147483648) * n);
  };
  for (let offset = -60; offset <= -1; offset++) {
    const count = offset > -7 ? 1 + pick(3) : offset > -31 ? 4 + pick(3) : 2 + pick(4);
    for (let i = 0; i < count; i++) {
      const title = history[(i + Math.abs(offset)) % history.length];
      const estimate = 1 + pick(4);
      const created = at(offset - 6 - pick(5), 9 + pick(8));
      run(
        `INSERT INTO tasks (id, workspace_id, project_id, title, status, priority, assignee_id, due_date, estimate, position, created_by, created_at, done_at, archived)
         VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        uid(), workspaceId, projectIds[pick(projectIds.length)], `${title} · ${Math.abs(offset)}`, "medium",
        userIds[pick(userIds.length)], day(offset), estimate, 200 + i, userIds[0], created,
        at(offset, 11 + pick(7)),
      );
    }
  }

  for (let offset = -60; offset <= -1; offset++) {
    for (const userId of userIds) {
      const sessions = 1 + pick(2);
      for (let i = 0; i < sessions; i++) {
        const minutes = 20 + pick(4) * 10;
        const start = 9 + i * 3 + pick(2);
        run(
          "INSERT INTO focus_sessions (id, user_id, task_id, minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
          uid(), userId, null, minutes, at(offset, start), at(offset, start + Math.floor(minutes / 60), minutes % 60),
        );
      }
    }
  }
}

export async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "1") return;
  if ((row<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces")?.n ?? 0) > 0) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  tx(() => {
    if ((row<{ n: number }>("SELECT COUNT(*) AS n FROM workspaces")?.n ?? 0) > 0) return;
    const workspaceId = uid();
    run("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)", workspaceId, "Lucent Studio", nowIso());

    const userIds: string[] = [];
    people.forEach(([name, email, role, team, location, tz, hue]) => {
      const id = uid();
      userIds.push(id);
      run(
        `INSERT INTO users (id, email, name, password_hash, role, team, location, tz_offset, hue, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, email, name, passwordHash, role, team, location, tz, hue, nowIso(),
      );
      run("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", id, workspaceId, id === userIds[0] ? "admin" : "member");
      run("INSERT INTO settings (user_id) VALUES (?)", id);
    });

    seedContent(workspaceId, userIds);
  });
}

/** Restores the sample content for a workspace without touching accounts. */
export function resetWorkspace(workspaceId: string) {
  const userIds = rows<{ id: string }>(
    "SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.workspace_id = ? ORDER BY u.created_at",
    workspaceId,
  ).map((r) => r.id);
  if (!userIds.length) return;

  tx(() => {
    run("DELETE FROM focus_sessions WHERE user_id IN (SELECT user_id FROM memberships WHERE workspace_id = ?)", workspaceId);
    run("DELETE FROM notification_reads WHERE notification_id IN (SELECT id FROM notifications WHERE workspace_id = ?)", workspaceId);
    run("DELETE FROM notifications WHERE workspace_id = ?", workspaceId);
    run("DELETE FROM activity WHERE workspace_id = ?", workspaceId);
    run("DELETE FROM events WHERE workspace_id = ?", workspaceId);
    run("DELETE FROM tasks WHERE workspace_id = ?", workspaceId);
    run("DELETE FROM projects WHERE workspace_id = ?", workspaceId);

    seedContent(workspaceId, userIds);
  });
}

