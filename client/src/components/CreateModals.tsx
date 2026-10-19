import { useState } from "react";
import { useStore, useWorkspace } from "../store";
import { Modal } from "./Modal";
import { todayIso } from "../lib/format";
import type { ProjectStatus, TaskStatus } from "../types";

const COLORS = ["#6ea8ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#2dd4bf", "#facc15", "#94a3b8"];

export function TaskModal({
  onClose,
  defaults,
}: {
  onClose: () => void;
  defaults?: { status?: TaskStatus; project_id?: string | null; due_date?: string | null };
}) {
  const { createTask, me } = useStore();
  const { projects, members } = useWorkspace();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaults?.project_id ?? projects[0]?.id ?? "");
  const [status, setStatus] = useState<TaskStatus>(defaults?.status ?? "todo");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState(me?.id ?? "");
  const [due, setDue] = useState(defaults?.due_date ?? "");
  const [estimate, setEstimate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await createTask({
        title: title.trim(),
        project_id: projectId || null,
        status,
        priority,
        assignee_id: assignee || null,
        due_date: due || null,
        estimate: estimate ? Number(estimate) : null,
        description: description.trim(),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New task"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" form="new-task" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </>
      }
    >
      <form id="new-task" onSubmit={submit} className="form-grid">
        {error && <div className="auth-error span2" role="alert">{error}</div>}
        <div className="field span2">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to happen?"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="task-project">Project</label>
          <select id="task-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-status">Status</label>
          <select id="task-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="in_review">In review</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-priority">Priority</label>
          <select id="task-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-assignee">Assignee</label>
          <select id="task-assignee" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-due">Due date</label>
          <input id="task-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="task-estimate">Estimate (h)</label>
          <input
            id="task-estimate"
            className="input"
            type="number"
            min={0}
            step={0.5}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="2"
          />
        </div>
        <div className="field span2">
          <label htmlFor="task-desc">Notes</label>
          <textarea
            id="task-desc"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Context, links, acceptance criteria…"
          />
        </div>
      </form>
    </Modal>
  );
}

export function ProjectModal({ onClose }: { onClose: () => void }) {
  const { createProject } = useStore();
  const { members, me } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [color, setColor] = useState(COLORS[0]);
  const [due, setDue] = useState("");
  const [lead, setLead] = useState(me?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await createProject({
        name: name.trim(),
        description: description.trim(),
        status,
        color,
        due_date: due || null,
        lead_id: lead || null,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" form="new-project" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <form id="new-project" onSubmit={submit} className="form-grid">
        {error && <div className="auth-error span2" role="alert">{error}</div>}
        <div className="field span2">
          <label htmlFor="proj-name">Name</label>
          <input id="proj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Project name" />
        </div>
        <div className="field span2">
          <label htmlFor="proj-desc">Description</label>
          <textarea id="proj-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
        </div>
        <div className="field">
          <label htmlFor="proj-status">Status</label>
          <select id="proj-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="review">In review</option>
            <option value="shipped">Shipped</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="proj-due">Target date</label>
          <input id="proj-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="proj-lead">Lead</label>
          <select id="proj-lead" className="select" value={lead} onChange={(e) => setLead(e.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">Color</span>
          <div className="row" style={{ gap: 6 }}>
            {COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="accent-dot"
                aria-pressed={color === value}
                aria-label={`Color ${value}`}
                style={{ background: value }}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function EventModal({ onClose, day }: { onClose: () => void; day?: string }) {
  const { createEvent } = useStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day ?? todayIso());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState("meeting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await createEvent({
        title: title.trim(),
        starts_at: `${date}T${time}`,
        duration_min: Number(duration),
        location: location.trim(),
        kind,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the event");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New event"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" form="new-event" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add event"}
          </button>
        </>
      }
    >
      <form id="new-event" onSubmit={submit} className="form-grid">
        {error && <div className="auth-error span2" role="alert">{error}</div>}
        <div className="field span2">
          <label htmlFor="ev-title">Title</label>
          <input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Design review" />
        </div>
        <div className="field">
          <label htmlFor="ev-date">Date</label>
          <input id="ev-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-time">Start</label>
          <input id="ev-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-dur">Duration (min)</label>
          <input id="ev-dur" className="input" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-kind">Type</label>
          <select id="ev-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="meeting">Meeting</option>
            <option value="review">Review</option>
            <option value="team">Team</option>
            <option value="focus">Focus block</option>
          </select>
        </div>
        <div className="field span2">
          <label htmlFor="ev-loc">Location</label>
          <input id="ev-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom, Studio B, or a link" />
        </div>
      </form>
    </Modal>
  );
}
