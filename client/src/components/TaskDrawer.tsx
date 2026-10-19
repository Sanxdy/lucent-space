import { useEffect, useRef, useState } from "react";
import { useStore, useWorkspace } from "../store";
import { useFocusTrap } from "../useFocusTrap";
import { Avatar } from "./Avatar";
import { dayLabel, relativeTime } from "../lib/format";
import type { Priority, TaskStatus } from "../types";
import { IconCheck, IconPlus, IconSend, IconTrash, IconX } from "./Icons";

export function TaskDrawer({ taskId }: { taskId: string }) {
  const workspace = useWorkspace();
  const {
    closeTask, patchTask, deleteTask, addSubtask, toggleSubtask, removeSubtask, addComment, me, toast,
  } = useStore();
  const task = workspace.tasks.find((item) => item.id === taskId);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [subtask, setSubtask] = useState("");
  const [comment, setComment] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, true, closeTask);

  const fail = (caught: unknown) =>
    toast(caught instanceof Error ? caught.message : "Could not save the task", "error");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
  }, [taskId, task?.title, task?.description]);

  if (!task) return null;
  const assignee = workspace.members.find((member) => member.id === task.assignee_id);
  const project = workspace.projects.find((item) => item.id === task.project_id);
  const doneSubtasks = task.subtasks.filter((item) => item.done).length;

  return (
    <>
      <div className="drawer-scrim" onClick={closeTask} aria-hidden="true" />
      <aside
        className="drawer glass glass-thick"
        role="dialog"
        aria-modal="true"
        aria-label={`Task: ${task.title}`}
        ref={panelRef}
      >
        <div className="drawer-head">
          <div className="row-between">
            <span className="eyebrow">Task</span>
            <div className="row" style={{ gap: 4 }}>
              <button
                className="btn-icon sm"
                aria-label="Delete task"
                onClick={() => {
                  if (window.confirm("Delete this task? This cannot be undone.")) void deleteTask(task.id).catch(fail);
                }}
              >
                <IconTrash size={14} />
              </button>
              <button className="btn-icon sm" aria-label="Close" onClick={closeTask}>
                <IconX size={15} />
              </button>
            </div>
          </div>
          <input
            className="drawer-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => title.trim() && title !== task.title && void patchTask(task.id, { title: title.trim() })}
            aria-label="Task title"
          />
          <div className="drawer-meta">
            {project && (
              <span className="chip">
                <span style={{ width: 6, height: 6, borderRadius: 99, background: project.color }} />
                {project.name}
              </span>
            )}
            <span className="chip">{task.subtasks.length > 0 ? `${doneSubtasks}/${task.subtasks.length} subtasks` : "No subtasks"}</span>
            <span className="chip">{relativeTime(task.created_at)}</span>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-grid">
            <label className="k" htmlFor="drawer-status">Move to</label>
            <select
              id="drawer-status"
              className="select"
              value={task.status}
              onChange={(event) => void patchTask(task.id, { status: event.target.value as TaskStatus })}
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="in_review">In review</option>
              <option value="done">Done</option>
            </select>

            <label className="k" htmlFor="drawer-priority">Priority</label>
            <select
              id="drawer-priority"
              className="select"
              value={task.priority}
              onChange={(event) => void patchTask(task.id, { priority: event.target.value as Priority })}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <label className="k" htmlFor="drawer-assignee">Assignee</label>
            <select
              id="drawer-assignee"
              className="select"
              value={task.assignee_id ?? ""}
              onChange={(event) => void patchTask(task.id, { assignee_id: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {workspace.members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>

            <label className="k" htmlFor="drawer-project">Project</label>
            <select
              id="drawer-project"
              className="select"
              value={task.project_id ?? ""}
              onChange={(event) => void patchTask(task.id, { project_id: event.target.value || null })}
            >
              <option value="">No project</option>
              {workspace.projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>

            <label className="k" htmlFor="drawer-due">Due</label>
            <input
              id="drawer-due"
              className="input"
              type="date"
              value={task.due_date ?? ""}
              onChange={(event) => void patchTask(task.id, { due_date: event.target.value || null })}
            />

            <label className="k" htmlFor="drawer-estimate">Estimate</label>
            <input
              id="drawer-estimate"
              className="input"
              type="number"
              min={0}
              step={0.5}
              value={task.estimate ?? ""}
              onChange={(event) =>
                void patchTask(task.id, { estimate: event.target.value === "" ? null : Number(event.target.value) })
              }
              placeholder="Hours"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="drawer-notes">Notes</label>
            <textarea
              id="drawer-notes"
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => description !== task.description && void patchTask(task.id, { description })}
              placeholder="Add context for whoever picks this up…"
            />
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="field-label">Subtasks</span>
              <span className="dim" style={{ fontSize: 11 }}>{doneSubtasks}/{task.subtasks.length}</span>
            </div>
            {task.subtasks.map((item) => (
              <div key={item.id} className={`subtask ${item.done ? "done" : ""}`}>
                <button
                  className="check"
                  data-checked={item.done}
                  aria-checked={item.done}
                  role="checkbox"
                  aria-label={item.title}
                  onClick={() => void toggleSubtask(task.id, item.id, !item.done).catch(fail)}
                >
                  <IconCheck size={11} />
                </button>
                <span className="st-title">{item.title}</span>
                <button className="del" aria-label="Remove subtask" onClick={() => void removeSubtask(task.id, item.id).catch(fail)}>
                  <IconX size={13} />
                </button>
              </div>
            ))}
            <form
              className="row"
              style={{ marginTop: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (!subtask.trim()) return;
                void addSubtask(task.id, subtask.trim()).catch(fail);
                setSubtask("");
              }}
            >
              <input
                className="input"
                style={{ height: 32 }}
                value={subtask}
                onChange={(event) => setSubtask(event.target.value)}
                placeholder="Add a subtask"
                aria-label="New subtask"
              />
              <button className="btn-icon sm" aria-label="Add subtask" type="submit">
                <IconPlus size={14} />
              </button>
            </form>
          </div>

          <div>
            <span className="field-label">Comments</span>
            <div style={{ marginTop: 6 }}>
              {task.comments.map((entry) => {
                const author = workspace.members.find((member) => member.id === entry.user_id);
                return (
                  <div key={entry.id} className="comment">
                    <Avatar name={author?.name ?? "Someone"} hue={author?.hue ?? 210} size="sm" />
                    <div className="cbody">
                      <div className="chead">
                        <strong>{author?.name ?? "Removed member"}</strong>
                        <span>{relativeTime(entry.created_at)}</span>
                      </div>
                      <p>{entry.body}</p>
                    </div>
                  </div>
                );
              })}
              {task.comments.length === 0 && <div className="empty" style={{ padding: "12px 0" }}>No comments yet.</div>}
            </div>
            <form
              className="row"
              style={{ marginTop: 10, alignItems: "flex-end" }}
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim()) return;
                void addComment(task.id, comment.trim()).catch(fail);
                setComment("");
              }}
            >
              <Avatar name={me?.name ?? "You"} hue={me?.hue} size="sm" />
              <input
                className="input"
                style={{ height: 34 }}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Leave a comment…"
                aria-label="Comment"
              />
              <button className="btn-icon sm" aria-label="Send comment" type="submit">
                <IconSend size={14} />
              </button>
            </form>
          </div>

          <div className="row dim" style={{ fontSize: 11, justifyContent: "space-between" }}>
            <span>{assignee ? `Assigned to ${assignee.name}` : "Unassigned"}</span>
            <span>{task.due_date ? `Due ${dayLabel(task.due_date)}` : "No due date"}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
