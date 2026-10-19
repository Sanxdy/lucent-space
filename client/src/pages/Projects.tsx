import { useState } from "react";
import { Seg } from "../components/Seg";
import { useNavigate } from "react-router-dom";
import { useStore, useWorkspace } from "../store";
import { AvatarStack } from "../components/Avatar";
import { ProjectModal } from "../components/CreateModals";
import {
  IconCalendar,
  IconChart,
  IconFlame,
  IconGrid,
  IconLeaf,
  IconPhone,
  IconPlus,
  IconProjects,
  IconRocket,
  IconShapes,
} from "../components/Icons";
import { dayLabel, isoDay } from "../lib/format";
import type { ProjectStatus } from "../types";

const FILTERS: { id: "all" | ProjectStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "planning", label: "Planning" },
  { id: "shipped", label: "Shipped" },
];

const GLYPHS: [RegExp, typeof IconRocket][] = [
  [/orbit|launch|rocket/i, IconRocket],
  [/tide|mobile|app/i, IconPhone],
  [/design|system|facet/i, IconShapes],
  [/sprout|onboard|grow/i, IconLeaf],
  [/brand|campaign|ember/i, IconFlame],
  [/analytics|northstar|insight/i, IconChart],
  [/grid|kit/i, IconGrid],
];

function glyphFor(name: string) {
  return GLYPHS.find(([pattern]) => pattern.test(name))?.[1] ?? IconProjects;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "In progress",
  review: "In review",
  shipped: "Shipped",
};

function daysUntil(date: string) {
  const diff = Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff === 0) return "today";
  return `in ${diff} ${diff === 1 ? "day" : "days"}`;
}

export function Projects() {
  const workspace = useWorkspace();
  const { updateProject } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [modal, setModal] = useState(false);

  const inFlight = workspace.projects.filter((project) => project.status !== "shipped");
  const projects = workspace.projects
    .filter((project) =>
      filter === "all"
        ? true
        : filter === "active"
          ? project.status === "active" || project.status === "review"
          : project.status === filter,
    )
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position);
  const shipped = workspace.projects.length - inFlight.length;
  const active = workspace.projects.filter((project) => project.status === "active" || project.status === "review").length;
  const onTrack = Math.round((inFlight.filter((project) => project.progress >= 25).length / Math.max(1, inFlight.length)) * 100);
  const monthKey = isoDay(new Date()).slice(0, 7);
  const dueThisMonth = workspace.projects.filter((project) => project.due_date?.startsWith(monthKey)).length;

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">Projects</h1>
          <p className="sub">{inFlight.length} in flight · {shipped} shipped</p>
        </div>
        <div className="head-stats">
          <article className="stat glass">
            <span className="stat-label">Active</span>
            <div className="stat-value">{active}</div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Shipped</span>
            <div className="stat-value">{shipped}</div>
          </article>
          <article className="stat glass">
            <span className="stat-label">On track</span>
            <div className="stat-value">{onTrack}<small>%</small></div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Due this month</span>
            <div className="stat-value">{dueThisMonth}</div>
          </article>
        </div>
        <div className="head-actions">
          <Seg>
            {FILTERS.map((item) => (
              <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </Seg>
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <IconPlus size={16} /> New project
          </button>
        </div>
      </header>

      <section className="proj-grid">
        {projects.map((project) => {
          const people = workspace.members.filter((member) => project.member_ids.includes(member.id));
          const milestone = project.next_milestone;
          return (
            <article
              key={project.id}
              className="proj-card glass"
              style={{ ["--hue" as string]: project.color }}
              onClick={() => navigate(`/projects/${project.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && navigate(`/projects/${project.id}`)}
            >
              <div className="pc-top">
                <span className="proj-mark">
                  {(() => {
                    const Glyph = glyphFor(project.name);
                    return <Glyph size={21} />;
                  })()}
                </span>
                <div className="pc-id">
                  <h2>{project.name}</h2>
                  <span className={`pstatus ${project.status}`}>
                    <i /> {STATUS_LABEL[project.status]}
                  </span>
                </div>
                <button
                  className={`pc-star ${project.pinned ? "on" : ""}`}
                  aria-pressed={project.pinned}
                  aria-label={project.pinned ? "Unpin project" : "Pin project"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void updateProject(project.id, { pinned: !project.pinned });
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  ★
                </button>
              </div>
              <p className="pc-desc">{project.description}</p>
              <div className="pc-next">
                <div className="pc-donut">
                  <svg viewBox="0 0 64 64" aria-hidden>
                    <circle className="pc-track" cx="32" cy="32" r="26" />
                    <circle
                      className="pc-arc"
                      cx="32"
                      cy="32"
                      r="26"
                      strokeDasharray={`${(project.progress / 100) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
                    />
                  </svg>
                  <b>{project.progress}%</b>
                </div>
                <div className="pc-next-copy">
                  <span className="pc-k">{project.status === "shipped" ? "Shipped" : "Next milestone"}</span>
                  <strong>{milestone ? milestone.title : project.status === "shipped" ? "Every milestone met" : "No milestone set"}</strong>
                  {milestone && <span className="pc-sub">{dayLabel(milestone.due_date)} · {daysUntil(milestone.due_date)}</span>}
                </div>
              </div>
              <div className="pc-foot">
                <AvatarStack people={people} max={4} />
                <span className="pv">{project.done_count}/{project.task_count} tasks</span>
                <span className="grow" />
                {project.due_date && (
                  <span className="pc-due"><IconCalendar size={15} /> {dayLabel(project.due_date)}</span>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {projects.length === 0 && (
        <div className="empty glass" style={{ marginTop: 18 }}>
          <strong>No projects in this stage</strong>
          <button className="btn btn-sm" onClick={() => setFilter("all")}>Show all</button>
        </div>
      )}

      {modal && <ProjectModal onClose={() => setModal(false)} />}
    </>
  );
}
