import { useRef, useState } from "react";
import { Seg } from "../components/Seg";
import { api } from "../api";
import { useStore, useWorkspace } from "../store";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { IconMessage, IconMoon, IconSun, IconUser } from "../components/Icons";
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
  const { me, toast } = useStore();
  const [team, setTeam] = useState("All");
  const [invite, setInvite] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "", team: "Design", location: "", tz_offset: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const teams = ["All", ...new Set(workspace.members.map((member) => member.team))];
  const members = workspace.members.filter((member) => team === "All" || member.team === team);
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
          <Seg>
            {teams.map((name) => (
              <button key={name} aria-pressed={team === name} onClick={() => setTeam(name)}>
                {name}
              </button>
            ))}
          </Seg>
          {me?.is_admin && (
            <button className="btn btn-primary" onClick={() => { setInvite(true); setCreated(null); }}>
              <IconUser size={16} /> Invite
            </button>
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
                  <Avatar name={member.name} hue={member.hue} />
                  <i className={`presence-dot ${status.cls}`} />
                </span>
                <div className="mc-id">
                  <strong>
                    {member.name}
                    {member.id === me?.id && <span className="you">You</span>}
                  </strong>
                  <span>{member.role}</span>
                  <span className="pchip" style={{ ["--hue" as string]: `hsl(${member.hue} 70% 55%)` }}>
                    <i /> {member.team}
                  </span>
                </div>
              </div>
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
              </div>
            </article>
          );
        })}
      </section>

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
                <select id="inv-team" className="select" value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })}>
                  {["Product", "Design", "Engineering", "Marketing", "Operations"].map((name) => (
                    <option key={name} value={name}>{name}</option>
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
