import { useMemo, useState } from "react";
import { Seg } from "../components/Seg";
import { useStore, useWorkspace } from "../store";
import { EventModal } from "../components/CreateModals";
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from "../components/Icons";
import { addDays, isoDay, monthMatrix, timeLabel, todayIso, weekDays } from "../lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_COLOR: Record<string, string> = {
  meeting: "var(--accent)",
  review: "var(--warn)",
  team: "var(--ok)",
  focus: "var(--accent-2)",
};

export function Calendar() {
  const workspace = useWorkspace();
  const { removeEvent, openTask, toast } = useStore();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayIso());
  const [view, setView] = useState<"month" | "week">("month");
  const [modalDay, setModalDay] = useState<string | null>(null);

  const cells = useMemo(() => {
    if (view === "week") return weekDays(new Date(`${selected}T12:00`));
    return monthMatrix(cursor.getFullYear(), cursor.getMonth());
  }, [cursor, selected, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof workspace.events>();
    for (const event of workspace.events) {
      const key = isoDay(new Date(event.starts_at));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [workspace.events]);

  const selectedEvents = byDay.get(selected) ?? [];
  const dueTasks = workspace.tasks.filter((task) => task.due_date === selected && task.status !== "done");
  const week = weekDays(new Date(`${selected}T12:00`));
  const weekCount = week.reduce((sum, day) => sum + (byDay.get(isoDay(day))?.length ?? 0), 0);
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekLabel = `${week[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${week[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const step = (delta: number) => {
    if (view === "week") {
      const next = addDays(new Date(`${selected}T12:00`), delta * 7);
      setSelected(isoDay(next));
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
      return;
    }
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(todayIso());
  };

  const selectedDate = new Date(`${selected}T12:00`);
  const isToday = selected === todayIso();

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">{view === "week" ? weekLabel : monthLabel}</h1>
          <p className="sub">{weekCount} {weekCount === 1 ? "event" : "events"} this week</p>
        </div>
        <div className="head-actions">
          <div className="cal-nav glass">
            <button onClick={() => step(-1)} aria-label={view === "week" ? "Previous week" : "Previous month"}>
              <IconChevronLeft size={15} />
            </button>
            <button className="cal-today" onClick={goToday}>Today</button>
            <button onClick={() => step(1)} aria-label={view === "week" ? "Next week" : "Next month"}>
              <IconChevronRight size={15} />
            </button>
          </div>
          <Seg>
            <button aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
            <button aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
          </Seg>
          <button className="btn btn-primary" onClick={() => setModalDay(selected)}>
            <IconPlus size={16} /> New event
          </button>
        </div>
      </header>

      <div className="cal-layout">
        <section className={`cal-card glass ${view}`}>
          <div className="cal-weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((cell) => {
              const key = isoDay(cell);
              const events = byDay.get(key) ?? [];
              const outside = view === "month" && cell.getMonth() !== cursor.getMonth();
              return (
                <button
                  key={key}
                  className={[
                    "cal-cell",
                    outside ? "out" : "",
                    key === todayIso() ? "today" : "",
                    key === selected ? "sel" : "",
                  ].join(" ")}
                  onClick={() => {
                    setSelected(key);
                    if (outside) setCursor(new Date(cell.getFullYear(), cell.getMonth(), 1));
                  }}
                  aria-label={`${cell.toDateString()}${events.length ? `, ${events.length} events` : ""}`}
                >
                  <span className="dnum">{cell.getDate()}</span>
                  {events.slice(0, view === "week" ? 6 : 2).map((event) => (
                    <span key={event.id} className={`cal-ev ${event.kind}`} title={`${timeLabel(event.starts_at)} ${event.title}`}>
                      {event.title}
                    </span>
                  ))}
                  {events.length > (view === "week" ? 6 : 2) && (
                    <span className="cal-more">+{events.length - (view === "week" ? 6 : 2)} more</span>
                  )}
                  {view === "month" && events.length > 0 && (
                    <span className="cal-dots" aria-hidden>
                      {events.slice(0, 4).map((event) => (
                        <i key={event.id} className={event.kind} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="grid cal-side">
          <section className="day-panel glass">
            <div className="dp-head">
              <div>
                <h2>{isToday ? "Today" : selectedDate.toLocaleDateString("en-US", { weekday: "long" })}</h2>
                <p>
                  {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} ·{" "}
                  {selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setModalDay(selected)}>
                <IconPlus size={14} /> Add event
              </button>
            </div>

            {selectedEvents.map((event) => (
              <div key={event.id} className="day-ev">
                <span className="t">{timeLabel(event.starts_at)}</span>
                <span className="ln" style={{ background: KIND_COLOR[event.kind] ?? "var(--accent)" }} />
                <div className="ev-body">
                  <div className="row-between" style={{ gap: 6 }}>
                    <strong>{event.title}</strong>
                    <button
                      className="del"
                      aria-label="Delete event"
                      onClick={() =>
                        void removeEvent(event.id).catch((caught) =>
                          toast(caught instanceof Error ? caught.message : "Could not delete the event", "error"),
                        )
                      }
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  <span>{event.duration_min} min · {event.location || "No location"}</span>
                  <span className="kind">{event.kind === "focus" ? "Focus block" : event.kind[0].toUpperCase() + event.kind.slice(1)}</span>
                </div>
              </div>
            ))}
            {selectedEvents.length === 0 && <div className="empty">No events. A clean slate.</div>}
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2>Due {isToday ? "today" : "this day"}</h2>
              <span className="hint">{dueTasks.length}</span>
            </div>
            {dueTasks.map((task) => (
              <button key={task.id} className="taskline" style={{ width: "100%", textAlign: "left" }} onClick={() => openTask(task.id)}>
                <span className="check" style={{ borderColor: "var(--accent-line)" }} />
                <span className="tl-body">
                  <strong>{task.title}</strong>
                  <span>{workspace.projects.find((project) => project.id === task.project_id)?.name ?? "Inbox"}</span>
                </span>
              </button>
            ))}
            {dueTasks.length === 0 && <div className="empty">Nothing due.</div>}
          </section>
        </aside>
      </div>

      {modalDay && <EventModal day={modalDay} onClose={() => setModalDay(null)} />}
    </>
  );
}
