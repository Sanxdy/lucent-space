import { useMemo, useState } from "react";
import { Seg } from "../components/Seg";
import { useStore, useWorkspace } from "../store";
import { Avatar } from "../components/Avatar";
import { TaskModal } from "../components/CreateModals";
import { IconCalendar, IconCheck, IconGrid, IconList, IconMessage, IconPlus, IconSearch } from "../components/Icons";
import { addDays, dayLabel, isoDay, todayIso } from "../lib/format";
import type { Task, TaskStatus } from "../types";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "in_review", label: "In review" },
  { id: "done", label: "Done" },
];

export function Tasks() {
  const workspace = useWorkspace();
  const { me, patchTask, toggleTask, openTask } = useStore();
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState("");
  const [mine, setMine] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.tasks.filter((task) => {
      if (mine && task.assignee_id !== me?.id) return false;
      if (project && task.project_id !== project) return false;
      if (priority && task.priority !== priority) return false;
      if (needle && !task.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [workspace.tasks, mine, me, project, priority, query]);

  const todayKey = todayIso();
  const overdue = workspace.tasks.filter(
    (task) => task.status !== "done" && task.due_date && task.due_date < todayKey,
  ).length;
  const totalOpen = workspace.tasks.filter((task) => task.status !== "done").length;
  const weekKey = isoDay(addDays(new Date(), 7));
  const dueThisWeek = workspace.tasks.filter(
    (task) => task.status !== "done" && task.due_date && task.due_date >= todayKey && task.due_date <= weekKey,
  ).length;
  const weekStart = isoDay(addDays(new Date(), -7));
  const doneThisWeek = workspace.tasks.filter(
    (task) => task.done_at && isoDay(new Date(task.done_at)) >= weekStart,
  ).length;

  const drop = (status: TaskStatus) => {
    if (dragId) void patchTask(dragId, { status });
    setDragId(null);
    setOverColumn(null);
  };

  const taskCard = (task: Task) => {
    const assignee = workspace.members.find((member) => member.id === task.assignee_id);
    const owner = workspace.projects.find((item) => item.id === task.project_id);
    const doneSubtasks = task.subtasks.filter((item) => item.done).length;
    const late = task.status !== "done" && task.due_date && task.due_date < todayKey;
    return (
      <div
        key={task.id}
        className={`tcard glass glass-thick ${dragId === task.id ? "dragging" : ""} ${task.status === "done" ? "is-done" : ""}`}
        draggable
        role="button"
        tabIndex={0}
        onDragStart={() => setDragId(task.id)}
        onDragEnd={() => {
          setDragId(null);
          setOverColumn(null);
        }}
        onClick={() => openTask(task.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTask(task.id);
          }
        }}
      >
        <div className="ttop">
          {owner && (
            <span className="pchip" style={{ ["--hue" as string]: owner.color }}>
              <i /> <span className="pchip-t">{owner.name}</span>
            </span>
          )}
          {(task.priority === "high" || task.priority === "urgent") && <span className="prio high">{task.priority}</span>}
          {task.priority === "medium" && <span className="prio med">medium</span>}
        </div>
        <div className="tt">{task.title}</div>
        {task.subtasks.length > 0 && (
          <div className="tsubs">
            <span className="tmeter">
              <i style={{ transform: `scaleX(${doneSubtasks / task.subtasks.length})`, ["--hue" as string]: owner?.color }} />
            </span>
            {doneSubtasks}/{task.subtasks.length}
          </div>
        )}
        <div className="tfoot">
          {task.due_date && (
            <span className={`due ${late ? "late" : task.due_date === todayKey ? "today" : ""}`}>
              {task.status === "done" ? <IconCheck size={13} /> : <IconCalendar size={13} />} {dayLabel(task.due_date)}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="row" style={{ gap: 4 }}>
              <IconMessage size={13} />
              {task.comments.length}
            </span>
          )}
          <span className="right">
            {assignee ? <Avatar name={assignee.name} hue={assignee.hue} avatar={assignee.avatar} id={assignee.id} size="sm" /> : <span className="dim">None</span>}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">Tasks</h1>
          <p className="sub">
            {totalOpen} open across {workspace.projects.length} projects
          </p>
        </div>
        <div className="head-stats">
          <article className="stat glass">
            <span className="stat-label">Open</span>
            <div className="stat-value">{totalOpen}</div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Due this week</span>
            <div className="stat-value">{dueThisWeek}</div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Overdue</span>
            <div className="stat-value" style={{ color: overdue > 0 ? "var(--danger)" : undefined }}>
              {overdue}
            </div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Done this week</span>
            <div className="stat-value">{doneThisWeek}</div>
          </article>
        </div>
        <div className="head-actions">
          <Seg className="seg-view">
            <button aria-pressed={view === "board"} onClick={() => setView("board")}>
              <IconGrid size={16} /> Board
            </button>
            <button aria-pressed={view === "list"} onClick={() => setView("list")}>
              <IconList size={16} /> List
            </button>
          </Seg>
          <button className="btn btn-primary" onClick={() => setNewStatus("todo")}>
            <IconPlus size={14} /> New task
          </button>
        </div>
      </header>

      <div className="tk-bar glass glass-chrome">
        <div className="tk-chips">
          <select
            className={`tk-chip ${project ? "is-on" : ""}`}
            value={project}
            onChange={(event) => setProject(event.target.value)}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {workspace.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button className={`tk-chip ${mine ? "is-on" : ""}`} aria-pressed={mine} onClick={() => setMine((value) => !value)}>
            <Avatar name={me?.name ?? "Me"} hue={me?.hue ?? 210} avatar={me?.avatar} id={me?.id} size="sm" />
            Mine only
          </button>
          <select
            className={`tk-chip ${priority ? "is-on" : ""}`}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            aria-label="Filter by priority"
          >
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <label className="tk-find">
          <IconSearch size={18} />
          <input
            className="tk-find-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title, project or person"
            aria-label="Filter tasks"
          />
        </label>
        <span className="tk-count">{filtered.length} shown</span>
      </div>

      {view === "board" ? (
        <section className="board">
          {COLUMNS.map((column) => {
            const tasks = filtered.filter((task) => task.status === column.id);
            const visible = column.id === "done" && !showAllDone ? tasks.slice(0, 6) : tasks;
            return (
              <div
                key={column.id}
                className={`bcol glass glass-chrome ${overColumn === column.id ? "over" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverColumn(column.id);
                }}
                onDragLeave={() => setOverColumn((current) => (current === column.id ? null : current))}
                onDrop={() => drop(column.id)}
              >
                <div className="bcol-head">
                  <span className={`cdot ${column.id}`} />
                  <strong>{column.label}</strong>
                  <span className="bcount">{tasks.length}</span>
                  <button className="addbtn" onClick={() => setNewStatus(column.id)} aria-label={`Add task to ${column.label}`}>
                    <IconPlus size={16} />
                  </button>
                </div>
                <div className="bcol-list">
                  {visible.map(taskCard)}
                  {tasks.length === 0 && <div className="bcol-empty">Nothing here</div>}
                </div>
                {column.id === "done" && tasks.length > 6 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: "100%", marginTop: 10 }}
                    onClick={() => setShowAllDone((value) => !value)}
                  >
                    {showAllDone ? "Show fewer" : `Show ${tasks.length - 6} more`}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <section className="tlist">
          <div className="trow head">
            <span />
            <span>Task</span>
            <span>Project</span>
            <span>Assignee</span>
            <span>Due</span>
            <span>Priority</span>
          </div>
          {filtered.map((task) => {
            const assignee = workspace.members.find((member) => member.id === task.assignee_id);
            const owner = workspace.projects.find((item) => item.id === task.project_id);
            return (
              <div key={task.id} className={`trow glass ${task.status === "done" ? "done" : ""}`}>
                <button
                  className="check"
                  role="checkbox"
                  aria-checked={task.status === "done"}
                  data-checked={task.status === "done"}
                  aria-label={`Complete ${task.title}`}
                  onClick={() => void toggleTask(task.id)}
                >
                  <IconCheck size={11} />
                </button>
                <button className="trow-title" style={{ textAlign: "left" }} onClick={() => openTask(task.id)}>
                  {task.title}
                </button>
                <span className="cell">
                  {owner && (
                    <>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: owner.color }} />
                      <span className="truncate">{owner.name}</span>
                    </>
                  )}
                </span>
                <span className="cell">
                  {assignee ? (
                    <>
                      <Avatar name={assignee.name} hue={assignee.hue} size="sm" />
                      <span className="truncate">{assignee.name}</span>
                    </>
                  ) : (
                    "None"
                  )}
                </span>
                <span className="cell">{task.due_date ? dayLabel(task.due_date) : "None"}</span>
                <span className="cell">
                  <span
                    className={`prio ${task.priority === "high" || task.priority === "urgent" ? "high" : task.priority === "medium" ? "med" : "low"}`}
                  >
                    {task.priority}
                  </span>
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty glass" style={{ marginTop: 10 }}>
              No tasks match those filters.
            </div>
          )}
        </section>
      )}

      {newStatus && <TaskModal onClose={() => setNewStatus(null)} defaults={{ status: newStatus }} />}
    </>
  );
}
