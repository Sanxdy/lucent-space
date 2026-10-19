import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useStore, useWorkspace } from "../store";
import { Avatar } from "../components/Avatar";
import { Burnup } from "../components/Charts";
import { IconArrowUpRight, IconCheck, IconPin, IconPlus } from "../components/Icons";
import { dayLabel, isoDay, relativeTime } from "../lib/format";

export function ProjectDetail() {
  const { id } = useParams();
  const workspace = useWorkspace();
  const { openTask, toggleTask, updateProject } = useStore();
  const project = workspace.projects.find((item) => item.id === id);

  const tasks = workspace.tasks.filter((task) => task.project_id === id);
  const done = tasks.filter((task) => task.status === "done");

  const burnup = useMemo(() => {
    const weeks = 8;
    const doneSeries: number[] = [];
    const totalSeries: number[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const endKey = isoDay(end);
      doneSeries.push(
        done.filter((task) => task.done_at && isoDay(new Date(task.done_at)) <= endKey).length,
      );
      totalSeries.push(
        tasks.filter((task) => isoDay(new Date(task.created_at)) <= endKey).length,
      );
    }
    return { doneSeries, totalSeries };
  }, [tasks, done]);

  if (!project) return <Navigate to="/projects" replace />;

  const lead = workspace.members.find((member) => member.id === project.lead_id);
  const people = workspace.members.filter((member) => project.member_ids.includes(member.id));
  const upcoming = tasks
    .filter((task) => task.status !== "done" && task.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);
  const activity = workspace.activity
    .filter((item) => item.subject.toLowerCase().includes(project.name.toLowerCase()))
    .slice(0, 5);
  const milestones = [...project.milestones].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <Link to="/projects" className="sub" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            ← Projects
          </Link>
          <h1 className="title" style={{ marginTop: 8 }}>{project.name}</h1>
          <p className="sub">{project.description}</p>
        </div>
        <div className="head-actions">
          <button
            className={`btn ${project.pinned ? "btn-primary" : ""}`}
            onClick={() => void updateProject(project.id, { pinned: !project.pinned })}
          >
            <IconPin size={14} /> {project.pinned ? "Pinned" : "Pin"}
          </button>
        </div>
      </header>

      <section className="detail-hero glass">
        <div className="dh-top">
          <span
            className="proj-mark"
            style={{ width: 48, height: 48, borderRadius: 14, fontSize: 20, background: `linear-gradient(145deg, ${project.color}, color-mix(in srgb, ${project.color} 55%, #000))` }}
          >
            {project.name.slice(0, 1)}
          </span>
          <div className="grow">
            <div className="dh-meta" style={{ marginTop: 0 }}>
              <span className={`chip ${project.status === "shipped" ? "ok" : project.status === "review" ? "warn" : "accent"}`}>
                {project.status === "review" ? "In review" : project.status}
              </span>
              <span className="chip">{project.task_count} tasks</span>
              <span className="chip">{done.length} done</span>
              {project.due_date && <span className="chip">Target {dayLabel(project.due_date)}</span>}
            </div>
          </div>
        </div>
        <div className="dh-prog">
          <div className="ph">
            <span>Progress</span>
            <b>{project.progress}%</b>
          </div>
          <div className="meter" style={{ height: 8 }}>
            <i style={{ width: `${project.progress}%`, background: project.color }} />
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <div className="grid">
          <section className="card glass">
            <div className="card-head">
              <h2>Burn-up</h2>
              <span className="hint">last 8 weeks</span>
            </div>
            <Burnup done={burnup.doneSeries} total={burnup.totalSeries} />
            <div className="row" style={{ gap: 16, marginTop: 8, fontSize: 11, color: "var(--text-3)" }}>
              <span className="row" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 2, background: "var(--accent)" }} /> Completed
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 2, background: "var(--text-4)" }} /> Scope
              </span>
            </div>
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2>Milestones</h2>
              <span className="hint">{milestones.filter((item) => !item.done).length} open</span>
            </div>
            {milestones.map((milestone) => (
              <div key={milestone.id} className={`milestone ${milestone.done ? "done" : ""}`}>
                <span className="mk"><IconCheck size={10} /></span>
                <span className="mb">
                  <strong>{milestone.title}</strong>
                  <span>{dayLabel(milestone.due_date)}</span>
                </span>
                <span className={`chip ${milestone.done ? "ok" : ""}`}>{milestone.done ? "Done" : "Upcoming"}</span>
              </div>
            ))}
            {milestones.length === 0 && <div className="empty">No milestones yet.</div>}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2>Tasks</h2>
              <Link className="hint" to="/tasks">Board <IconArrowUpRight size={11} style={{ display: "inline" }} /></Link>
            </div>
            {tasks.slice(0, 10).map((task) => (
              <div key={task.id} className={`taskline ${task.status === "done" ? "done" : ""}`}>
                <button
                  className="check"
                  data-checked={task.status === "done"}
                  role="checkbox"
                  aria-checked={task.status === "done"}
                  aria-label={`Complete ${task.title}`}
                  onClick={() => void toggleTask(task.id)}
                >
                  <IconCheck size={11} />
                </button>
                <button className="tl-body" style={{ textAlign: "left" }} onClick={() => openTask(task.id)}>
                  <strong>{task.title}</strong>
                  <span>{task.due_date ? `Due ${dayLabel(task.due_date)}` : "No due date"} · {task.status.replace("_", " ")}</span>
                </button>
                {task.priority === "high" || task.priority === "urgent" ? <span className="prio high">{task.priority}</span> : null}
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="empty">
                <strong>No tasks yet</strong>
                <Link className="btn btn-sm" to="/tasks"><IconPlus size={12} /> Add one</Link>
              </div>
            )}
          </section>
        </div>

        <div className="grid">
          <section className="card glass">
            <div className="card-head"><h2>People</h2></div>
            {lead && (
              <div className="presence">
                <Avatar name={lead.name} hue={lead.hue} size="lg" />
                <span className="pv">
                  <strong>{lead.name}</strong>
                  <span>{lead.role} · project lead</span>
                </span>
              </div>
            )}
            {people.filter((member) => member.id !== lead?.id).map((member) => (
              <div key={member.id} className="presence">
                <Avatar name={member.name} hue={member.hue} />
                <span className="pv">
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                </span>
              </div>
            ))}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2>Next up</h2>
              <span className="hint">{upcoming.length}</span>
            </div>
            {upcoming.map((task) => (
              <div key={task.id} className="taskline">
                <span style={{ width: 6, height: 6, borderRadius: 99, background: project.color }} />
                <button className="tl-body" style={{ textAlign: "left" }} onClick={() => openTask(task.id)}>
                  <strong>{task.title}</strong>
                  <span>Due {dayLabel(task.due_date ?? "")}</span>
                </button>
              </div>
            ))}
            {upcoming.length === 0 && <div className="empty">Nothing scheduled.</div>}
          </section>

          <section className="card glass">
            <div className="card-head"><h2>Activity</h2></div>
            {activity.map((item) => (
              <div key={item.id} className="act-item">
                <Avatar name={item.user_name ?? "Lucent"} hue={item.hue ?? 210} size="sm" />
                <span>
                  <b>{item.user_name ?? "Someone"}</b> {item.verb} <b>{item.subject}</b>
                  <span className="when">{relativeTime(item.created_at)}</span>
                </span>
              </div>
            ))}
            {activity.length === 0 && <div className="empty">No activity on this project yet.</div>}
          </section>
        </div>
      </div>
    </>
  );
}
