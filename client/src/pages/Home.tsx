import { useMemo, useState } from "react";
import { Seg } from "../components/Seg";
import { Link } from "react-router-dom";
import { useStore, useTimerRemaining, useWorkspace } from "../store";
import { Avatar } from "../components/Avatar";
import {
  IconCalendar,
  IconCheck,
  IconPause,
  IconPlay,
  IconPlus,
  IconTimer,
} from "../components/Icons";
import {
  addDays,
  dayLabel,
  greeting,
  isoDay,
  memberTime,
  pad,
  pct,
  relativeTime,
  timeLabel,
  todayIso,
  weekDays,
} from "../lib/format";

const hours = (minutes: number) => (minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h` : `${minutes}m`);
const arc = (value: number, radius: number) => {
  const circumference = 2 * Math.PI * radius;
  return `${Math.max(0, Math.min(1, value)) * circumference} ${circumference}`;
};
const eventHue = (kind: string) => (kind === "review" ? "var(--warn)" : kind === "team" ? "var(--ok)" : "var(--accent)");

export function Home() {
  const workspace = useWorkspace();
  const { me, toggleTask, openTask, timer, startFocus, pauseFocus, resumeFocus, endFocus } = useStore();
  const [rightTab, setRightTab] = useState<"team" | "activity">("team");
  const [minutes, setMinutes] = useState(workspace.settings.focus_minutes || 25);
  const [focusTask, setFocusTask] = useState("");
  const remaining = useTimerRemaining();

  const today = todayIso();
  const now = new Date();
  const myTasks = workspace.tasks.filter((task) => task.assignee_id === me?.id);
  const myOpen = myTasks.filter((task) => task.status !== "done");
  const doneToday = myTasks.filter((task) => task.done_at && isoDay(new Date(task.done_at)) === today);
  const overdue = myOpen.filter((task) => task.due_date && task.due_date < today);
  const dueToday = myOpen.filter((task) => task.due_date === today);

  const todaysEvents = workspace.events
    .filter((event) => isoDay(new Date(event.starts_at)) === today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = todaysEvents.filter((event) => new Date(event.starts_at).getTime() >= now.getTime());
  const nextEvents = (upcoming.length > 0 ? upcoming : todaysEvents).slice(0, 4);
  const nextEvent = nextEvents[0];
  const meetingsDone = todaysEvents.filter(
    (event) => new Date(event.starts_at).getTime() + event.duration_min * 60_000 < now.getTime(),
  ).length;

  const week = weekDays(now);
  const weekBars = week.map((day) => {
    const key = isoDay(day);
    const count = workspace.tasks.filter((task) => task.done_at && isoDay(new Date(task.done_at)) === key).length;
    return { key, label: day.toLocaleDateString("en-US", { weekday: "narrow" }), count, today: key === today };
  });
  const weekTotal = weekBars.reduce((sum, bar) => sum + bar.count, 0);
  const lastWeek = weekDays(addDays(now, -7));
  const lastWeekTotal = workspace.tasks.filter(
    (task) => task.done_at && lastWeek.some((day) => isoDay(day) === isoDay(new Date(task.done_at!))),
  ).length;
  const weekDelta = lastWeekTotal ? Math.round(((weekTotal - lastWeekTotal) / lastWeekTotal) * 100) : 0;

  const taskTotal = doneToday.length + dueToday.length;
  const taskPct = pct(doneToday.length, Math.max(taskTotal, 1)) / 100;
  const focusPct = Math.min(1, workspace.focus.minutes / 120);
  const meetPct = todaysEvents.length ? meetingsDone / todaysEvents.length : 0;

  const active = timer.running || timer.endsAt !== null || timer.remaining !== timer.total;
  const time = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;

  const activity = workspace.activity.slice(0, 6);
  const online = workspace.members.slice(0, 6);

  const dateLine = useMemo(() => {
    const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const meetings = todaysEvents.length;
    const left = myOpen.filter((task) => task.due_date && task.due_date <= today).length;
    return `${day} · ${meetings} ${meetings === 1 ? "meeting" : "meetings"} and ${left} ${left === 1 ? "task" : "tasks"} left today`;
  }, [now, todaysEvents.length, myOpen, today]);

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">{greeting(now)}, {me?.name.split(" ")[0]}</h1>
          <p className="sub">{dateLine}</p>
        </div>
        <div className="head-stats">
          <article className="stat glass">
            <span className="stat-label">Done today</span>
            <div className="stat-value">{doneToday.length}<small>/ {Math.max(taskTotal, 1)}</small></div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Focus today</span>
            <div className="stat-value">{hours(workspace.focus.minutes)}<small>/ 2h</small></div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Overdue</span>
            <div className="stat-value" style={{ color: overdue.length > 0 ? "var(--danger)" : undefined }}>
              {overdue.length}
            </div>
          </article>
        </div>
        <div className="head-actions">
          <Link className="btn" to="/tasks"><IconPlus size={15} /> New task</Link>
          {nextEvent ? (
            <Link className="btn btn-primary home-next" to="/calendar">
              <IconCalendar size={15} /> Next: {timeLabel(nextEvent.starts_at)}
            </Link>
          ) : (
            <span className="chip accent"><IconTimer size={12} /> {workspace.focus.sessions} focus sessions today</span>
          )}
        </div>
      </header>

      <div className="home">
        <section className="card glass w-rings">
          <div className="card-head">
            <div>
              <h2>Today</h2>
              <span className="hint">Close your rings</span>
            </div>
          </div>
          <div className="rings">
            <svg className="rings-svg" viewBox="0 0 136 136" role="img" aria-label="Today's progress rings">
              <circle className="rings-track rings-tasks" cx="68" cy="68" r="56" />
              <circle className="rings-tasks" cx="68" cy="68" r="56" strokeDasharray={arc(taskPct, 56)} />
              <circle className="rings-track rings-focus" cx="68" cy="68" r="41" />
              <circle className="rings-focus" cx="68" cy="68" r="41" strokeDasharray={arc(focusPct, 41)} />
              <circle className="rings-track rings-meet" cx="68" cy="68" r="26" />
              <circle className="rings-meet" cx="68" cy="68" r="26" strokeDasharray={arc(meetPct, 26)} />
            </svg>
            <dl className="rings-legend">
              <div className="rings-row rings-tasks">
                <dt>Tasks</dt>
                <dd>{doneToday.length}<small>/ {Math.max(taskTotal, 1)}</small></dd>
              </div>
              <div className="rings-row rings-focus">
                <dt>Focus</dt>
                <dd>{hours(workspace.focus.minutes)}<small>/ 2h</small></dd>
              </div>
              <div className="rings-row rings-meet">
                <dt>Meetings</dt>
                <dd>{meetingsDone}<small>/ {todaysEvents.length}</small></dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card glass w-next">
          <div className="card-head">
            <div>
              <h2>Up next</h2>
              <span className="hint">Your day from here</span>
            </div>
            <Link className="hint" to="/calendar">Calendar</Link>
          </div>
          {nextEvent ? (
            <>
              <div className="next" style={{ ["--hue" as string]: eventHue(nextEvent.kind) }}>
                <span className="next-when">
                  {new Date(nextEvent.starts_at) > now ? (
                    <>in <b>{relativeTime(nextEvent.starts_at).replace(" ago", "")}</b></>
                  ) : (
                    <b>Now</b>
                  )}
                </span>
                <span className="next-title">{nextEvent.title}</span>
                <span className="next-meta">
                  {timeLabel(nextEvent.starts_at)} · {nextEvent.duration_min} min{nextEvent.location ? ` · ${nextEvent.location}` : ""}
                </span>
                <span className="next-foot">
                  <span className="chip">{nextEvent.kind}</span>
                  <Link className="hint" to="/calendar">Open day</Link>
                </span>
              </div>
              {nextEvents.length > 1 && (
                <div className="next-rest">
                  {nextEvents.slice(1).map((event) => (
                    <Link key={event.id} to="/calendar" style={{ ["--hue" as string]: eventHue(event.kind) }}>
                      <i />
                      <span>{event.title}</span>
                      <time>{timeLabel(event.starts_at)}</time>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty">No meetings today. Protect the focus time.</div>
          )}
        </section>

        <section className="card glass w-focus">
          <div className="card-head">
            <div>
              <h2>Focus</h2>
              <span className="hint">The island keeps the time</span>
            </div>
            {!active && (
              <Seg className="seg-sm">
                {[15, 25, 50].map((value) => (
                  <button key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>
                    {value}m
                  </button>
                ))}
              </Seg>
            )}
          </div>
          <div className="focus-body">
            <div className="focus-main">
              <div className="focus-dial">
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle className="focus-track" cx="60" cy="60" r="52" />
                  <circle
                    className="focus-arc"
                    cx="60"
                    cy="60"
                    r="52"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - (active ? pct(timer.total - remaining, timer.total) : 0) / 100)}`}
                  />
                </svg>
                <div className="focus-read">
                  <span className="focus-time">{active ? time : `${pad(minutes)}:00`}</span>
                  <span className="focus-state">{active ? (timer.running ? "Focusing" : "Paused") : "Ready"}</span>
                </div>
              </div>
              <div className="focus-side">
                {!active ? (
                  <div className="focus-idle">
                    <span className="focus-label">Focus on</span>
                    <select className="select" value={focusTask} onChange={(event) => setFocusTask(event.target.value)} aria-label="Task to focus on">
                      <option value="">No task, just focus</option>
                      {myOpen.map((task) => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" onClick={() => void startFocus(minutes, focusTask || null)}>
                      <IconPlay size={13} /> Start focus
                    </button>
                  </div>
                ) : (
                  <div className="focus-idle">
                    <span className="focus-label">Focusing on</span>
                    <div className="focus-task">{myOpen.find((task) => task.id === focusTask)?.title ?? `${Math.round(timer.total / 60)}-minute block`}</div>
                    <div className="focus-btns">
                      <button className="btn" onClick={timer.running ? pauseFocus : resumeFocus}>
                        {timer.running ? <IconPause size={13} /> : <IconPlay size={13} />}
                        {timer.running ? "Pause" : "Resume"}
                      </button>
                      <button className="btn" onClick={endFocus}>End</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="focus-today">
              <div className="focus-today-row">
                <span>Focused today</span>
                <b>{hours(workspace.focus.minutes)} · {workspace.focus.sessions} sessions</b>
              </div>
              <div className="focus-meter"><i style={{ transform: `scaleX(${Math.min(1, workspace.focus.minutes / 120)})` }} /></div>
            </div>
          </div>
        </section>

        <section className="card glass w-tasks">
          <div className="card-head">
            <div>
              <h2>My tasks</h2>
              <span className="hint">Due today and late</span>
            </div>
            <Link className="hint" to="/tasks">All tasks</Link>
          </div>
          {myOpen.slice(0, 6).map((task) => {
            const project = workspace.projects.find((item) => item.id === task.project_id);
            return (
              <div key={task.id} className="taskline">
                <button
                  className="check"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Complete ${task.title}`}
                  onClick={() => void toggleTask(task.id)}
                >
                  <IconCheck size={11} />
                </button>
                <button className="tl-body" style={{ textAlign: "left" }} onClick={() => openTask(task.id)}>
                  <strong>{task.title}</strong>
                  <span className="tl-meta">
                    <span className="pchip" style={{ ["--hue" as string]: project?.color ?? "var(--text-3)" }}>
                      <i /> <span className="pchip-t">{project?.name ?? "Inbox"}</span>
                    </span>
                    {task.due_date && (
                      <span className={`tl-due ${task.due_date < today ? "late" : ""}`}>
                        {task.due_date < today ? "Overdue" : dayLabel(task.due_date)}
                      </span>
                    )}
                  </span>
                </button>
                {task.priority === "high" || task.priority === "urgent" ? (
                  <span className={`prio ${task.priority === "urgent" ? "urgent" : "high"}`}>{task.priority}</span>
                ) : null}
              </div>
            );
          })}
          {myOpen.length === 0 && <div className="empty">Nothing assigned to you. Rare and excellent.</div>}
        </section>

        <section className="card glass w-week">
          <div className="card-head">
            <div>
              <h2>This week</h2>
              <span className="hint">Tasks the team finished</span>
            </div>
            <Link className="hint" to="/insights">View report</Link>
          </div>
          <div className="week-sum">
            <b>{weekTotal}</b> finished so far
            <span className={`delta ${weekDelta > 0 ? "up" : weekDelta < 0 ? "down" : "flat"}`}>
              {weekDelta > 0 ? "+" : weekDelta < 0 ? "−" : ""}{Math.abs(weekDelta)}% vs last week
            </span>
          </div>
          <div className="bars">
            {weekBars.map((bar) => {
              const max = Math.max(1, ...weekBars.map((item) => item.count));
              return (
                <div key={bar.key} className={`bar ${bar.today ? "today" : ""}`}>
                  <div className="bar-track">
                    <i style={{ height: `${(bar.count / max) * 100}%` }} />
                  </div>
                  <span>{bar.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card glass w-projects">
          <div className="card-head">
            <div>
              <h2>Projects</h2>
              <span className="hint">Progress across the studio</span>
            </div>
            <Link className="hint" to="/projects">All projects</Link>
          </div>
          {workspace.projects.slice(0, 4).map((project) => (
            <div key={project.id} className="projline">
              <div className="pl-top">
                <span style={{ width: 7, height: 7, borderRadius: 99, background: project.color }} />
                <strong>{project.name}</strong>
                <span>{project.done_count}/{project.task_count}</span>
              </div>
              <div className="meter"><i style={{ width: `${project.progress}%` }} /></div>
            </div>
          ))}
        </section>

        <section className="card glass w-people">
          <div className="card-head">
            <Seg>
              <button aria-pressed={rightTab === "team"} onClick={() => setRightTab("team")}>Team</button>
              <button aria-pressed={rightTab === "activity"} onClick={() => setRightTab("activity")}>Activity</button>
            </Seg>
            <Link className="hint" to="/team">Team page</Link>
          </div>
          {rightTab === "team" ? (
            <div className="toggle-panel">
              {online.map((member) => (
                <div key={member.id} className="presence">
                  <Avatar name={member.name} hue={member.hue} avatar={member.avatar} id={member.id} size="sm" />
                  <span className="pv">
                    <strong>{member.name}</strong>
                    <span>{memberTime(member.tz_offset)} · {member.location}</span>
                  </span>
                  {member.id === me?.id && <span className="online" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="toggle-panel">
              {activity.map((item) => (
                <div key={item.id} className="act-item">
                  <Avatar name={item.user_name ?? "Lucent"} hue={item.hue ?? 210} size="sm" />
                  <span>
                    <b>{item.user_name ?? "Someone"}</b> {item.verb} <b>{item.subject}</b>
                    <span className="when">{relativeTime(item.created_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
