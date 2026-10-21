import { rows, isoDay } from "./db.js";
import { projectColor } from "./palette.js";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  project_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  estimate: number | null;
  created_at: string;
  done_at: string | null;
};

type MemberRow = { id: string; name: string; hue: number; team: string; role: string };

const DAY = 86_400_000;
const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export function buildInsights(workspaceId: string, range: 7 | 30 | 90) {
  const today = startOfDay(new Date());
  const start = new Date(today.getTime() - (range - 1) * DAY);
  const prevStart = new Date(start.getTime() - range * DAY);
  const startIso = isoDay(start);
  const prevStartIso = isoDay(prevStart);

  const allTasks = rows<TaskRow>("SELECT * FROM tasks WHERE workspace_id = ?", workspaceId);
  const members = rows<MemberRow>("SELECT u.id, u.name, u.hue, u.team, u.role FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.workspace_id = ?", workspaceId);
  const projects = rows<{ id: string; name: string; color: string }>("SELECT id, name, color FROM projects WHERE workspace_id = ?", workspaceId);

  const done = allTasks.filter((t) => t.status === "done" && t.done_at);
  const inWindow = (iso: string | null, from: string, to: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const current = done.filter((t) => inWindow(t.done_at, startIso, isoDay(today)));
  const previous = done.filter((t) => inWindow(t.done_at, prevStartIso, isoDay(new Date(start.getTime() - DAY))));

  const onTime = (t: TaskRow) => !!t.due_date && !!t.done_at && t.done_at.slice(0, 10) <= t.due_date;

  /**
   * Only tasks that actually had a deadline can be early or late. Counting undated
   * tasks as late made a workspace with four finished, deadline-free tasks report
   * "0% on time, 4 late", which reads as a broken report rather than as no data.
   */
  const rateOf = (list: TaskRow[]): number | null => {
    const dated = list.filter((t) => !!t.due_date);
    if (!dated.length) return null;
    return Math.round((dated.filter(onTime).length / dated.length) * 100);
  };
  const rate = rateOf(current);
  const prevRate = rateOf(previous);

  const focusRows = rows<{ minutes: number; ended_at: string }>(
    `SELECT f.minutes, f.ended_at FROM focus_sessions f
       JOIN memberships m ON m.user_id = f.user_id
      WHERE m.workspace_id = ? AND f.ended_at >= ?`,
    workspaceId,
    `${prevStartIso}T00:00`,
  );
  const focusMinutes = (from: string, to: string) =>
    focusRows.filter((f) => inWindow(f.ended_at, from, to)).reduce((sum, f) => sum + f.minutes, 0) / 60;
  const focusHours = focusMinutes(startIso, isoDay(today));
  const prevFocusHours = focusMinutes(prevStartIso, isoDay(new Date(start.getTime() - DAY)));

  const cycle = (list: TaskRow[]) => {
    const values = list
      .filter((t) => t.done_at)
      .map((t) => Math.max(0, (new Date(t.done_at!).getTime() - new Date(t.created_at).getTime()) / DAY));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  };
  const cycleDays = cycle(current);
  const prevCycleDays = cycle(previous);

  /**
   * Work finished in minutes rounds to 0.0 days, which looks like the report is not
   * updating at all. Below a day the figure is shown in hours instead.
   */
  const presentCycle = (days: number) =>
    days > 0 && days < 1
      ? { value: Math.round(days * 240) / 10, unit: "h" as const }
      : { value: Math.round(days * 10) / 10, unit: "d" as const };
  const cycleNow = presentCycle(cycleDays);
  const cyclePrev = presentCycle(prevCycleDays);

  const weekly = range === 90;
  const buckets: { label: string; from: string; to: string }[] = [];
  if (weekly) {
    for (let i = 12; i >= 0; i--) {
      const end = new Date(today.getTime() - i * 7 * DAY);
      const begin = new Date(end.getTime() - 6 * DAY);
      buckets.push({ label: end.toLocaleDateString("en-US", { month: "short", day: "numeric" }), from: isoDay(begin), to: isoDay(end) });
    }
  } else {
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      const label = range === 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      buckets.push({ label, from: isoDay(d), to: isoDay(d) });
    }
  }

  const series = (list: TaskRow[], offsetMs: number) =>
    buckets.map((b) => {
      const from = isoDay(new Date(new Date(`${b.from}T00:00`).getTime() - offsetMs));
      const to = isoDay(new Date(new Date(`${b.to}T00:00`).getTime() - offsetMs));
      return list.filter((t) => inWindow(t.done_at, from, to)).length;
    });

  const currentSeries = series(current, 0);
  const previousSeries = series(done, (weekly ? 13 * 7 : range) * DAY);

  const focusSeries = buckets.map((b) => {
    const minutes = focusRows.filter((f) => inWindow(f.ended_at, b.from, b.to)).reduce((sum, f) => sum + f.minutes, 0);
    return Math.round((minutes / 60) * 10) / 10;
  });

  const byProject = projects
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: projectColor(p.color),
      done: current.filter((t) => t.project_id === p.id).length,
    }))
    .filter((p) => p.done > 0)
    .sort((a, b) => b.done - a.done);

  const openTasks = allTasks.filter((t) => t.status !== "done");
  const workload = members.map((m) => {
    const assigned = openTasks.filter((t) => t.assignee_id === m.id);
    const load = assigned.reduce((sum, t) => sum + (t.estimate ?? 2), 0);
    const cap = 32;
    return { id: m.id, name: m.name, hue: m.hue, team: m.team, role: m.role, load: Math.round(load), cap, open: assigned.length };
  });

  const slowest = openTasks
    .map((t) => ({
      id: t.id,
      title: t.title,
      age: Math.floor((Date.now() - new Date(t.created_at).getTime()) / DAY),
      late: !!t.due_date && t.due_date < isoDay(today),
      due_date: t.due_date,
    }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 6);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Unassigned";
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "No project";

  const table = current
    .sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1))
    .map((t) => ({
      id: t.id,
      title: t.title,
      project: projectName(t.project_id),
      assignee: memberName(t.assignee_id),
      done_at: t.done_at,
      on_time: onTime(t),
      estimate: t.estimate,
    }));

  return {
    range,
    stats: {
      completed: { value: current.length, delta: current.length - previous.length },
      onTime: {
        value: rate,
        // null means "no task had a deadline", which is not the same as 0%.
        hasData: rate !== null,
        delta: rate !== null && prevRate !== null ? rate - prevRate : null,
      },
      focus: { value: Math.round(focusHours * 10) / 10, delta: Math.round((focusHours - prevFocusHours) * 10) / 10 },
      cycle: {
        value: cycleNow.value,
        unit: cycleNow.unit,
        // Only comparable when both periods used the same unit.
        delta: cycleNow.unit === cyclePrev.unit ? Math.round((cycleNow.value - cyclePrev.value) * 10) / 10 : null,
      },
    },
    buckets: buckets.map((b) => b.label),
    current: currentSeries,
    previous: previousSeries,
    focusSeries,
    projects: byProject,
    onTimeSplit: {
      ok: current.filter(onTime).length,
      late: current.filter((t) => !!t.due_date && !onTime(t)).length,
      // Finished without a deadline: reported so the numbers add up to `completed`.
      undated: current.filter((t) => !t.due_date).length,
    },
    workload,
    slowest,
    table,
    weekly,
  };
}
