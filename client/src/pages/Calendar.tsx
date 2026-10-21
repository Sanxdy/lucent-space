import { useEffect, useMemo, useState } from "react";
import { Seg } from "../components/Seg";
import { api } from "../api";
import { useStore, useWorkspace } from "../store";
import { EventModal } from "../components/CreateModals";
import { Modal } from "../components/Modal";
import { IconChevronLeft, IconChevronRight, IconPlus, IconRefresh, IconTrash } from "../components/Icons";
import { addDays, isoDay, monthMatrix, timeLabel, todayIso, weekDays } from "../lib/format";
import type { GoogleCalendarStatus, GoogleEvent } from "../types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_COLOR: Record<string, string> = {
  meeting: "var(--accent)",
  review: "var(--warn)",
  team: "var(--ok)",
  focus: "var(--accent-2)",
  google: "var(--google, #4285f4)",
};

/** "All day" or the start time, whichever the item actually has. */
function whenLabel(item: { all_day: boolean; starts_at: string }) {
  return item.all_day ? "All day" : timeLabel(item.starts_at);
}

/** Length in minutes, for the day panel line. */
function minutesOf(item: { all_day: boolean; starts_at: string; ends_at: string }) {
  if (item.all_day) return 0;
  const start = new Date(item.starts_at).getTime();
  const end = new Date(item.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

/** One row in the grid or the day panel, whether it came from Lucent or Google. */
type CalItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  kind: string;
  google: boolean;
};

export function Calendar() {
  const workspace = useWorkspace();
  const { removeEvent, openTask, toast, refresh } = useStore();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayIso());
  const [view, setView] = useState<"month" | "week">("month");
  const [modalDay, setModalDay] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gStatus, setGStatus] = useState<GoogleCalendarStatus | null>(null);
  const [gEvents, setGEvents] = useState<GoogleEvent[]>([]);
  const [gUrl, setGUrl] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const [gError, setGError] = useState("");

  const feedToken = workspace.calendar?.token ?? null;
  const feedUrl = feedToken
    ? `${window.location.origin}/api/calendar.ics?token=${encodeURIComponent(feedToken)}`
    : "";

  const createFeed = async () => {
    setSyncBusy(true);
    try {
      await api.createCalendarToken();
      await refresh();
      toast("Calendar link created");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not create the link", "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const revokeFeed = async () => {
    if (!window.confirm("Turn off the calendar link? Anything subscribed to it stops updating.")) return;
    setSyncBusy(true);
    try {
      await api.revokeCalendarToken();
      await refresh();
      toast("Calendar link turned off");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not turn it off", "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const copyFeed = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed, select the link and copy it manually", "error");
    }
  };

  const loadGStatus = async () => {
    try {
      setGStatus(await api.getGoogleCalendar());
    } catch {
      // A status read failing should not break the calendar itself.
      setGStatus(null);
    }
  };

  const connectGoogle = async (event: React.FormEvent) => {
    event.preventDefault();
    setGBusy(true);
    setGError("");
    try {
      const result = await api.connectGoogleCalendar(gUrl.trim());
      setGUrl("");
      await loadGStatus();
      toast(`Imported ${result.event_count} ${result.event_count === 1 ? "event" : "events"} from Google`);
    } catch (caught) {
      setGError(caught instanceof Error ? caught.message : "Could not connect that calendar");
    } finally {
      setGBusy(false);
    }
  };

  const refreshGoogle = async () => {
    setGBusy(true);
    setGError("");
    try {
      const result = await api.syncGoogleCalendar();
      await loadGStatus();
      toast(`Refreshed, ${result.event_count} ${result.event_count === 1 ? "event" : "events"} from Google`);
    } catch (caught) {
      setGError(caught instanceof Error ? caught.message : "Could not refresh");
      await loadGStatus();
    } finally {
      setGBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!window.confirm("Stop importing this Google calendar? The events disappear from here; nothing changes in Google.")) return;
    setGBusy(true);
    try {
      await api.disconnectGoogleCalendar();
      setGEvents([]);
      await loadGStatus();
      toast("Google Calendar disconnected");
    } catch (caught) {
      setGError(caught instanceof Error ? caught.message : "Could not disconnect");
    } finally {
      setGBusy(false);
    }
  };

  const cells = useMemo(() => {
    if (view === "week") return weekDays(new Date(`${selected}T12:00`));
    return monthMatrix(cursor.getFullYear(), cursor.getMonth());
  }, [cursor, selected, view]);

  useEffect(() => {
    void loadGStatus();
  }, []);

  // Ask only for the range on screen: the calendar never needs the whole feed.
  useEffect(() => {
    if (!gStatus?.connected) {
      setGEvents([]);
      return;
    }
    const first = cells[0];
    const last = cells[cells.length - 1];
    const from = new Date(first.getFullYear(), first.getMonth(), first.getDate()).toISOString();
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString();
    let cancelled = false;
    api
      .googleCalendarEvents(from, to)
      .then((result) => {
        if (!cancelled) setGEvents(result.events);
      })
      .catch(() => {
        if (!cancelled) setGEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gStatus?.connected, cells]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();

    for (const event of workspace.events) {
      const key = isoDay(new Date(event.starts_at));
      const list = map.get(key) ?? [];
      list.push({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        ends_at: event.starts_at,
        all_day: false,
        location: event.location,
        kind: event.kind,
        google: false,
      });
      map.set(key, list);
    }

    for (const event of gEvents) {
      // An all-day event is stored at UTC midnight of its date. Converting it to local
      // time would shift it a day backwards in any negative-offset timezone, so the date
      // is read straight off the string instead.
      const key = event.all_day ? event.starts_at.slice(0, 10) : isoDay(new Date(event.starts_at));
      const list = map.get(key) ?? [];
      list.push({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        all_day: Boolean(event.all_day),
        location: event.location,
        kind: "google",
        google: true,
      });
      map.set(key, list);
    }

    for (const list of map.values()) {
      // All-day entries lead the day, then everything by start time.
      list.sort((a, b) => {
        if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
        return a.starts_at.localeCompare(b.starts_at);
      });
    }
    return map;
  }, [workspace.events, gEvents]);

  const selectedEvents = byDay.get(selected) ?? [];
  const googleCount = gEvents.length;
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
          <p className="sub">
            {weekCount} {weekCount === 1 ? "event" : "events"} this week
            {gStatus?.connected ? ` · ${googleCount} imported from Google` : ""}
          </p>
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
          <button className="btn" onClick={() => setSyncOpen(true)}>
            <IconRefresh size={16} /> Sync
          </button>
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
                    <span
                      key={event.id}
                      className={`cal-ev ${event.kind}${event.google ? " google" : ""}`}
                      title={`${whenLabel(event)} ${event.title}${event.google ? " (Google)" : ""}`}
                    >
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
              <div key={event.id} className={`day-ev${event.google ? " is-google" : ""}`}>
                <span className="t">{whenLabel(event)}</span>
                <span className="ln" style={{ background: KIND_COLOR[event.kind] ?? "var(--accent)" }} />
                <div className="ev-body">
                  <div className="row-between" style={{ gap: 6 }}>
                    <strong>{event.title}</strong>
                    {/* Imported events are read-only: Google owns them, so there is nothing to delete here. */}
                    {!event.google && (
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
                    )}
                  </div>
                  <span>
                    {event.all_day
                      ? "All day"
                      : `${minutesOf(event)} min`}
                    {" · "}
                    {event.location || "No location"}
                  </span>
                  <span className="kind">
                    {event.google
                      ? "From Google Calendar"
                      : event.kind === "focus"
                        ? "Focus block"
                        : event.kind[0].toUpperCase() + event.kind.slice(1)}
                  </span>
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

      {syncOpen && (
        <Modal
          title="Calendar sync"
          onClose={() => setSyncOpen(false)}
          wide
          footer={<button className="btn btn-primary" onClick={() => setSyncOpen(false)}>Done</button>}
        >
          <div className="col" style={{ gap: 22 }}>
            {/* ---------------- Google -> Lucent ---------------- */}
            <section className="col" style={{ gap: 12 }}>
              <div>
                <h3 className="sync-title">Bring your Google Calendar in</h3>
                <p className="sub" style={{ margin: "4px 0 0" }}>
                  Your Google events appear in this calendar, marked as coming from Google. They are
                  read-only here: changing or deleting one has to happen in Google.
                </p>
              </div>

              {gStatus?.connected ? (
                <>
                  <div className="field">
                    <span className="field-label">Connected calendar</span>
                    <input className="input mono" readOnly value={gStatus.masked} aria-label="Connected Google calendar" />
                  </div>
                  <p className="sub" style={{ margin: 0 }}>
                    {gStatus.event_count} {gStatus.event_count === 1 ? "event" : "events"} imported
                    {gStatus.last_sync
                      ? ` · last checked ${new Date(gStatus.last_sync).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                  {gStatus.error && <div className="auth-error" role="alert">{gStatus.error}</div>}
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => void refreshGoogle()} disabled={gBusy}>
                      <IconRefresh size={14} /> {gBusy ? "Refreshing…" : "Refresh now"}
                    </button>
                    <button className="btn btn-sm btn-icon-danger" onClick={() => void disconnectGoogle()} disabled={gBusy}>
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <form className="col" style={{ gap: 10 }} onSubmit={connectGoogle}>
                  {gError && <div className="auth-error" role="alert">{gError}</div>}
                  <div className="field">
                    <label htmlFor="gcal-url">Secret iCal address</label>
                    <input
                      id="gcal-url"
                      className="input mono"
                      value={gUrl}
                      onChange={(event) => setGUrl(event.target.value)}
                      placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                      required
                      spellCheck={false}
                      autoCapitalize="none"
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={gBusy}>
                    {gBusy ? "Checking the address…" : "Connect Google Calendar"}
                  </button>
                  <div className="col" style={{ gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>Where to find it</strong>
                    <ol className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                      <li>Open Google Calendar on a computer.</li>
                      <li>Under My calendars, hover the calendar and click the three dots.</li>
                      <li>Choose Settings and scroll to Secret address in iCal format.</li>
                      <li>Copy that address and paste it above.</li>
                    </ol>
                    <span className="sub">
                      Treat the address like a password: anyone holding it can read the calendar. It is
                      stored on this server and never shown back in full.
                    </span>
                  </div>
                </form>
              )}
            </section>

            <hr className="sync-divider" />

            {/* ---------------- Lucent -> Google ---------------- */}
            <section className="col" style={{ gap: 12 }}>
              <div>
                <h3 className="sync-title">Share this calendar out</h3>
                <p className="sub" style={{ margin: "4px 0 0" }}>
                  The other direction: a read-only feed of Lucent events that Google Calendar, Apple
                  Calendar and Outlook can subscribe to. They refresh on their own schedule.
                </p>
              </div>
              {feedToken ? (
                <>
                  <div className="field">
                    <span className="field-label">Feed link</span>
                    <input
                      className="input mono"
                      readOnly
                      value={feedUrl}
                      aria-label="Calendar feed link"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => void copyFeed()}>
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <button className="btn btn-sm" onClick={() => void createFeed()} disabled={syncBusy}>
                      Rotate link
                    </button>
                    <button className="btn btn-sm btn-icon-danger" onClick={() => void revokeFeed()} disabled={syncBusy}>
                      Turn off
                    </button>
                  </div>
                  <ol className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Open Google Calendar on a computer.</li>
                    <li>Next to Other calendars, click the plus, then From URL.</li>
                    <li>Paste the feed link and click Add calendar.</li>
                  </ol>
                </>
              ) : (
                <div className="col" style={{ gap: 10 }}>
                  <p className="sub" style={{ margin: 0 }}>
                    No feed link yet. Create one to get a private URL you can paste into Google Calendar.
                  </p>
                  <button className="btn" onClick={() => void createFeed()} disabled={syncBusy}>
                    {syncBusy ? "Creating…" : "Create feed link"}
                  </button>
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}
    </>
  );
}
