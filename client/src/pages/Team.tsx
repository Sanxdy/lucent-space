import { useEffect, useRef, useState } from "react";
import { Seg } from "../components/Seg";
import { api } from "../api";
import { useStore, useWorkspace } from "../store";
import type { Member } from "../types";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { IconMessage, IconMoon, IconPencil, IconSun, IconTeam, IconTrash, IconUser } from "../components/Icons";
import { memberTime, timezoneRelation } from "../lib/format";

// ponytail: presence and capacity are derived from the member id so the demo looks alive; swap for real heartbeats and contracted hours when sessions go realtime.
function seedOf(id: string) {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
const PRESENCE = [
  { label: "Online", cls: "online" },
  { label: "In focus", cls: "focus" },
  { label: "Online", cls: "online" },
  { label: "In a meeting", cls: "meeting" },
  { label: "Online", cls: "online" },
  { label: "Away", cls: "away" },
  { label: "In focus", cls: "focus" },
  { label: "Online", cls: "online" },
  { label: "Online", cls: "online" },
  { label: "Online", cls: "online" },
  { label: "Away", cls: "away" },
  { label: "Online", cls: "online" },
];
function statusOf(member: { id: string }) {
  return PRESENCE[seedOf(member.id) % PRESENCE.length];
}
function capacityOf(member: { id: string }) {
  return [32, 36, 28][seedOf(member.id) % 3];
}
function isDaytime(tzOffset: number) {
  const now = new Date();
  const hour = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + tzOffset * 60_000).getHours();
  return hour >= 7 && hour < 19;
}

export function Team() {
  const workspace = useWorkspace();
  const { me, toast, refresh } = useStore();
  const [team, setTeam] = useState("All");
  const [invite, setInvite] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "", team: "", location: "", tz_offset: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [teamModal, setTeamModal] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "", team: "", location: "", tz_offset: "0", workspace_role: "member" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const [filtersOverflow, setFiltersOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateFilterEdges = () => {
    const el = filterRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setFiltersOverflow(overflow);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };
  const [newTeam, setNewTeam] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // Teams are workspace rows now, so an admin can add and remove them. Fall back
  // to the names in use only if the registry is somehow empty.
  const registry = workspace.teams?.length
    ? workspace.teams
    : [...new Set(workspace.members.map((member) => member.team))].map((name, index) => ({
        id: name,
        name,
        position: index,
      }));
  const teams = ["All", ...registry.map((row) => row.name)];
  const members = workspace.members.filter((member) => team === "All" || member.team === team);
  const countFor = (name: string) => workspace.members.filter((member) => member.team === name).length;
  const defaultTeam = registry[0]?.name ?? "Product";

  const addTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    setTeamBusy(true);
    setTeamError("");
    try {
      await api.createTeam(newTeam.trim());
      await refresh();
      toast(`Team “${newTeam.trim()}” added`);
      setNewTeam("");
    } catch (caught) {
      setTeamError(caught instanceof Error ? caught.message : "Could not add that team");
    } finally {
      setTeamBusy(false);
    }
  };

  const removeTeam = async (row: { id: string; name: string }) => {
    const count = countFor(row.name);
    const others = registry.filter((candidate) => candidate.id !== row.id);
    const moveTo = count && others.length ? others[0] : undefined;
    const warning = count
      ? `Delete “${row.name}”? ${count} ${count === 1 ? "person moves" : "people move"} to “${moveTo?.name}”.`
      : `Delete “${row.name}”?`;
    if (!window.confirm(warning)) return;
    try {
      await api.deleteTeam(row.id, moveTo?.id);
      await refresh();
      if (team === row.name) setTeam("All");
      toast(`Team “${row.name}” deleted`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not delete that team", "error");
    }
  };

  const openEdit = (member: Member) => {
    setEditForm({
      name: member.name,
      email: member.email,
      role: member.role,
      team: member.team,
      location: member.location,
      tz_offset: String(member.tz_offset),
      workspace_role: member.workspace_role === "admin" ? "admin" : "member",
    });
    setEditError("");
    setEditing(member);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setEditError("");
    try {
      await api.updateMember(editing.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role.trim(),
        team: editForm.team,
        location: editForm.location.trim(),
        tz_offset: Number(editForm.tz_offset) || 0,
        workspace_role: editForm.workspace_role === "admin" ? "admin" : "member",
      });
      await refresh();
      toast(`${editForm.name.trim()} updated`);
      setEditing(null);
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "Could not save those changes");
    } finally {
      setEditBusy(false);
    }
  };

  const removeMember = async (member: { id: string; name: string }) => {
    if (!window.confirm(`Remove ${member.name} from this workspace? Their tasks stay and become unassigned.`)) return;
    try {
      await api.removeMember(member.id);
      await refresh();
      toast(`${member.name} removed`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not remove them", "error");
    }
  };
  useEffect(() => {
    updateFilterEdges();
    const el = filterRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateFilterEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [teams.length]);

  const openTasks = workspace.tasks.filter((task) => task.status !== "done");
  const online = workspace.members.filter((member) => statusOf(member).label === "Online").length;
  const inFocus = workspace.members.filter((member) => statusOf(member).label === "In focus").length;
  const totalLoad = workspace.members.reduce(
    (sum, member) => sum + openTasks.filter((task) => task.assignee_id === member.id).reduce((hours, task) => hours + (task.estimate ?? 2), 0),
    0,
  );
  const totalCap = workspace.members.reduce((sum, member) => sum + capacityOf(member), 0);
  const averageLoad = Math.round((totalLoad / totalCap) * 100);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.invite({ ...form, tz_offset: Number(form.tz_offset) });
      setCreated({ email: form.email, password: result.temporary_password });
      toast(`${form.name} can now sign in`);
      setForm({ name: "", email: "", role: "", team: "Design", location: "", tz_offset: "0" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not invite them");
      emailRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">Team</h1>
          <p className="sub">{workspace.members.length} people · {teams.length - 1} teams · presence is sample data</p>
        </div>
        <div className="head-stats">
          <article className="stat glass">
            <span className="stat-label">Online now</span>
            <div className="stat-value">{online}<small>/ {workspace.members.length}</small></div>
          </article>
          <article className="stat glass">
            <span className="stat-label">In focus</span>
            <div className="stat-value">{inFocus}</div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Average load</span>
            <div className="stat-value">{averageLoad}<span className="pct">%</span></div>
          </article>
        </div>
        <div className="head-actions">
          <div
            className={`filter-scroll${filtersOverflow ? " is-overflowing" : ""}${atStart ? " at-start" : ""}${atEnd ? " at-end" : ""}`}
            ref={filterRef}
            onScroll={updateFilterEdges}
          >
            <Seg>
              {teams.map((name) => (
                <button key={name} aria-pressed={team === name} onClick={() => setTeam(name)}>
                  {name}
                </button>
              ))}
            </Seg>
          </div>
          {me?.is_admin && (
            <>
              <button className="btn" onClick={() => { setTeamModal(true); setTeamError(""); }}>
                <IconTeam size={16} /> Teams
              </button>
              <button className="btn btn-primary" onClick={() => { setInvite(true); setCreated(null); setForm({ ...form, team: form.team || defaultTeam }); }}>
                <IconUser size={16} /> Invite
              </button>
            </>
          )}
        </div>
      </header>

      <section className="team-grid">
        {members.map((member) => {
          const status = statusOf(member);
          const mine = openTasks.filter((task) => task.assignee_id === member.id);
          const load = mine.reduce((sum, task) => sum + (task.estimate ?? 2), 0);
          const cap = capacityOf(member);
          return (
            <article key={member.id} className="member-card glass">
              <div className="mc-top">
                <span className="mc-av">
                  <Avatar name={member.name} hue={member.hue} avatar={member.avatar} id={member.id} />
                  <i className={`presence-dot ${status.cls}`} />
                </span>
                <div className="mc-id">
                  <strong>
                    {member.name}
                    {member.id === me?.id && <span className="you">You</span>}
                  </strong>
                  <span>{member.role}</span>
                </div>
              </div>
              <span className="pchip" style={{ ["--hue" as string]: `hsl(${member.hue} 70% 55%)` }}>
                <i /> <span className="pchip-t">{member.team}</span>
              </span>
              <div className="mc-when">
                <span className={`presence ${status.cls}`}><i /> {status.label}</span>
                <span className="mc-time">
                  <span>
                    {isDaytime(member.tz_offset) ? <IconSun size={15} /> : <IconMoon size={15} />}
                    {memberTime(member.tz_offset)} {member.location.split(",")[0].trim()}
                  </span>
                  <small>{timezoneRelation(member.tz_offset)}</small>
                </span>
              </div>
              <div className="mc-load">
                <div className="mc-load-row">
                  <span>Workload</span>
                  <b>{load}h <span>/ {cap}h</span></b>
                </div>
                <div className="meter">
                  <i
                    style={{
                      width: `${Math.min(100, (load / cap) * 100)}%`,
                      background: load > cap ? "var(--danger)" : "var(--ok)",
                    }}
                  />
                </div>
              </div>
              <div className="mc-foot">
                <span className="mc-tasks"><IconCheckSmall /> {mine.length} open {mine.length === 1 ? "task" : "tasks"}</span>
                <span className="grow" />
                <a className="btn-icon" href={`mailto:${member.email}`} aria-label={`Message ${member.name}`}>
                  <IconMessage size={16} />
                </a>
                {me?.is_admin && (
                  <button
                    className="btn-icon"
                    aria-label={`Edit ${member.name}`}
                    title={`Edit ${member.name}`}
                    onClick={() => openEdit(member)}
                  >
                    <IconPencil size={16} />
                  </button>
                )}
                {me?.is_admin && member.id !== me.id && (
                  <button
                    className="btn-icon btn-icon-danger"
                    aria-label={`Remove ${member.name}`}
                    title={`Remove ${member.name}`}
                    onClick={() => void removeMember(member)}
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {editing && (
        <Modal
          title={`Edit ${editing.name}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" form="edit-member" className="btn btn-primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </>
          }
        >
          <form id="edit-member" className="col" style={{ gap: 14 }} onSubmit={saveEdit}>
            {editError && <div className="auth-error" role="alert">{editError}</div>}

            <div className="field">
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                className="input"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="edit-email">Email</label>
              <input
                id="edit-email"
                className="input"
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="edit-role">Job title</label>
              <input
                id="edit-role"
                className="input"
                value={editForm.role}
                onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="edit-team">Team</label>
              <select
                id="edit-team"
                className="select"
                value={editForm.team}
                onChange={(event) => setEditForm({ ...editForm, team: event.target.value })}
              >
                {registry.map((row) => (
                  <option key={row.id} value={row.name}>{row.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="edit-location">Location</label>
              <input
                id="edit-location"
                className="input"
                value={editForm.location}
                onChange={(event) => setEditForm({ ...editForm, location: event.target.value })}
                placeholder="City, Country"
              />
            </div>

            <div className="field">
              <label htmlFor="edit-workspace-role">Workspace role</label>
              <select
                id="edit-workspace-role"
                className="select"
                value={editForm.workspace_role}
                onChange={(event) => setEditForm({ ...editForm, workspace_role: event.target.value })}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </form>
        </Modal>
      )}

      {teamModal && (
        <Modal
          title="Teams"
          onClose={() => setTeamModal(false)}
          footer={<button className="btn btn-primary" onClick={() => setTeamModal(false)}>Done</button>}
        >
          <div className="col" style={{ gap: 14 }}>
            <form className="row" style={{ gap: 8 }} onSubmit={addTeam}>
              <input
                className="input"
                aria-label="New team name"
                placeholder="New team name"
                value={newTeam}
                onChange={(event) => setNewTeam(event.target.value)}
                maxLength={40}
              />
              <button className="btn btn-primary" type="submit" disabled={teamBusy || newTeam.trim().length < 2}>
                {teamBusy ? "Adding…" : "Add team"}
              </button>
            </form>
            {teamError && <div className="auth-error" role="alert">{teamError}</div>}
            <div className="col" style={{ gap: 6 }}>
              {registry.map((row) => {
                const count = countFor(row.name);
                return (
                  <div key={row.id} className="row" style={{ gap: 10, alignItems: "center" }}>
                    <span className="grow">
                      {row.name}
                      <span className="sub" style={{ marginLeft: 8 }}>
                        {count} {count === 1 ? "person" : "people"}
                      </span>
                    </span>
                    <button
                      className="btn btn-sm btn-icon-danger"
                      aria-label={`Delete ${row.name}`}
                      onClick={() => void removeTeam(row)}
                      disabled={registry.length === 1}
                      title={registry.length === 1 ? "A workspace needs at least one team" : `Delete ${row.name}`}
                    >
                      <IconTrash size={15} /> Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {invite && (
        <Modal
          title={created ? "Invite ready" : "Invite someone"}
          onClose={() => setInvite(false)}
          footer={
            created ? (
              <button className="btn btn-primary" onClick={() => setInvite(false)}>Done</button>
            ) : (
              <>
                <button className="btn" onClick={() => setInvite(false)} type="button">Cancel</button>
                <button className="btn btn-primary" form="invite-form" type="submit" disabled={busy}>
                  {busy ? "Inviting…" : "Send invite"}
                </button>
              </>
            )
          }
        >
          {created ? (
            <div className="col" style={{ gap: 12 }}>
              <p className="sub">Share these credentials with {created.email}. They can change their password later from Settings.</p>
              <div className="field">
                <span className="field-label">Temporary password</span>
                <input className="input mono" readOnly value={created.password} onFocus={(event) => event.currentTarget.select()} aria-label="Temporary password" />
              </div>
            </div>
          ) : (
            <form id="invite-form" className="form-grid" onSubmit={submit}>
              {error && <div className="auth-error span2" role="alert">{error}</div>}
              <div className="field span2">
                <label htmlFor="inv-name">Full name</label>
                <input id="inv-name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </div>
              <div className="field span2">
                <label htmlFor="inv-email">Email</label>
                <input id="inv-email" ref={emailRef} className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="inv-role">Role</label>
                <input id="inv-role" className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Product Designer" />
              </div>
              <div className="field">
                <label htmlFor="inv-team">Team</label>
                <select id="inv-team" className="select" value={form.team || defaultTeam} onChange={(event) => setForm({ ...form, team: event.target.value })}>
                  {registry.map((row) => (
                    <option key={row.id} value={row.name}>{row.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="inv-loc">Location</label>
                <input id="inv-loc" className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Berlin, DE" />
              </div>
              <div className="field">
                <label htmlFor="inv-tz">UTC offset (min)</label>
                <input id="inv-tz" className="input" type="number" step={30} value={form.tz_offset} onChange={(event) => setForm({ ...form, tz_offset: event.target.value })} />
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function IconCheckSmall() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}
