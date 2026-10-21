import { useEffect, useState } from "react";
import { Seg } from "../components/Seg";
import { api } from "../api";
import { useStore } from "../store";
import { Avatar } from "../components/Avatar";
import { AreaChart, Bars, Donut } from "../components/Charts";
import { IconDownload, IconGrid, IconTable } from "../components/Icons";
import { dayLabel, isoDay } from "../lib/format";
import type { Insights as InsightsData } from "../types";

const RANGES = [7, 30, 90];

function Delta({ value, suffix = "", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (!value) return <span className="delta flat">no change</span>;
  const positive = invert ? value < 0 : value > 0;
  return (
    <span className={`delta ${positive ? "up" : "down"}`}>
      {value > 0 ? "+" : "−"}{Math.abs(value)}{suffix}
    </span>
  );
}

export function Insights() {
  const { toast } = useStore();
  const [range, setRange] = useState(30);
  const [data, setData] = useState<InsightsData | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError("");
    api
      .insights(range)
      .then((payload) => alive && setData(payload))
      .catch((caught) => alive && setError(caught instanceof Error ? caught.message : "Could not load insights"));
    return () => {
      alive = false;
    };
  }, [range, attempt]);

  const rangeControl = (
    <Seg className="seg-range">
      {RANGES.map((value) => (
        <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>
          {value}D
        </button>
      ))}
    </Seg>
  );

  if (error) {
    return (
      <>
        <header className="page-head">
          <div className="head-copy">
            <h1 className="title">Insights</h1>
            <p className="sub">How the team worked over the last {range} days</p>
          </div>
          <div className="head-actions">{rangeControl}</div>
        </header>
        <div className="empty glass" style={{ marginTop: 18 }} role="alert">
          <strong>Could not load insights</strong>
          {error}
          <button className="btn btn-sm" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <header className="page-head">
          <div className="head-copy">
            <h1 className="title">Insights</h1>
            <p className="sub">How the team worked over the last {range} days</p>
          </div>
          <div className="head-actions">{rangeControl}</div>
        </header>
        <div className="auth" style={{ minHeight: "50vh" }}>
          <span className="spinner" role="status" aria-label="Loading insights" />
          <span className="sr-only">Loading insights</span>
        </div>
      </>
    );
  }

  const { stats } = data;
  const overloaded = data.workload.filter((member) => member.load > member.cap).length;
  const totalSplit = data.onTimeSplit.ok + data.onTimeSplit.late || 1;
  const period = data.weekly ? "13 weeks" : `${range} days`;

  return (
    <>
      <header className="page-head">
        <div className="head-copy">
          <h1 className="title">Insights</h1>
          <p className="sub">How the team worked over the last {range} days</p>
        </div>
        <div className="head-stats">
          <article className="stat glass">
            <span className="stat-label">Completed</span>
            <div className="stat-value">{stats.completed.value}<Delta value={stats.completed.delta} suffix="%" /></div>
          </article>
          <article className="stat glass">
            <span className="stat-label">On-time rate</span>
            <div className="stat-value">
              {stats.onTime.hasData ? <>{stats.onTime.value}<small>%</small></> : <span className="stat-empty">No deadlines</span>}
              {stats.onTime.delta !== null && <Delta value={stats.onTime.delta} suffix=" pts" />}
            </div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Focus hours</span>
            <div className="stat-value">
              {stats.focus.value > 0 ? <>{stats.focus.value}<small>h</small></> : <span className="stat-empty">Not tracked</span>}
              {stats.focus.value > 0 && <Delta value={stats.focus.delta} suffix="%" />}
            </div>
          </article>
          <article className="stat glass">
            <span className="stat-label">Avg cycle time</span>
            <div className="stat-value">
              {stats.cycle.value}<small>{stats.cycle.unit}</small>
              {stats.cycle.delta !== null && <Delta value={stats.cycle.delta} suffix={stats.cycle.unit} invert />}
            </div>
          </article>
        </div>
        <div className="head-actions">
          {rangeControl}
          <button
            className="btn"
            onClick={() => {
              window.location.href = "/api/export.csv";
              toast("Preparing your CSV download");
            }}
          >
            <IconDownload size={16} /> Export CSV
          </button>
        </div>
      </header>

      <div className="ins-grid">
        <section className="card glass">
            <div className="card-head">
              <div>
                <h2>Throughput</h2>
                <span className="hint">Tasks finished each day</span>
              </div>
              <button className="btn btn-sm" onClick={() => setView(view === "chart" ? "table" : "chart")}>
                {view === "chart" ? <IconTable size={15} /> : <IconGrid size={15} />}
                {view === "chart" ? "Table" : "Chart"}
              </button>
            </div>
            <div className="ins-sum">
              <b>{stats.completed.value}</b> finished
              <Delta value={stats.completed.delta} suffix="%" />
              <span>vs previous {range} days</span>
              <span className="legend legend-lines">
                <span className="li"><i /> Last {range} days</span>
                <span className="li"><i className="dash" /> Previous {range} days</span>
              </span>
            </div>
            {view === "chart" ? (
              data.current.some((value) => value > 0) ? (
                <AreaChart labels={data.buckets} values={data.current} secondary={data.previous} height={214} />
              ) : (
                <div className="empty">Nothing finished in this period.</div>
              )
            ) : (
              <div style={{ maxHeight: 190, overflow: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Task</th><th>Project</th><th>Owner</th><th>Done</th><th>On time</th></tr>
                  </thead>
                  <tbody>
                    {data.table.slice(0, 20).map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>{row.project}</td>
                        <td>{row.assignee}</td>
                        <td className="n">{row.done_at ? dayLabel(isoDay(new Date(row.done_at))) : "None"}</td>
                        <td>{row.on_time ? "Yes" : "Late"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.table.length === 0 && <div className="empty">Nothing completed in this period.</div>}
              </div>
            )}
          </section>

        <section className="card glass">
            <div className="card-head">
              <div>
                <h2>By project</h2>
                <span className="hint">Where the finished work went</span>
              </div>
            </div>
            <div className="donut-wrap">
              {data.projects.length > 0 ? (
                <Donut segments={data.projects.map((project) => ({ label: project.name, value: project.done, color: project.color }))} />
              ) : (
                <div className="empty">No completions yet.</div>
              )}
              <div className="legend">
                {data.projects.slice(0, 5).map((project) => (
                  <div key={project.id} className="li">
                    <i style={{ background: project.color }} />
                    <span className="truncate">{project.name}</span>
                    <span>{project.done}</span>
                    <span className="wlp">{Math.round((project.done / Math.max(1, stats.completed.value)) * 100)}%</span>
                  </div>
                ))}
                {data.projects.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No completions yet</span>}
              </div>
            </div>
          </section>
      </div>

      <div className="ins-grid">
        <section className="card glass">
            <div className="card-head">
              <div>
                <h2>Focus</h2>
                <span className="hint">Team focus hours each day</span>
              </div>
              <span className="hint">{period}</span>
            </div>
            <div className="ins-sum">
              {stats.focus.value > 0 ? (
                <>
                  <b>{stats.focus.value}</b> hours
                  <span>about {(stats.focus.value / range).toFixed(1)}h a day</span>
                </>
              ) : (
                <span>Nothing tracked yet</span>
              )}
            </div>
            {data.focusSeries.some((value) => value > 0) ? (
              <Bars values={data.focusSeries} labels={data.buckets} height={214} />
            ) : (
              <div className="empty">
                No focus sessions in this period. Start one from the timer on Home and this fills in.
              </div>
            )}
          </section>

        <section className="card glass">
            <div className="card-head">
              <div>
                <h2>Workload</h2>
                <span className="hint">Open task hours against weekly capacity</span>
              </div>
              <span className="chip">{overloaded ? `${overloaded} over capacity` : "All within capacity"}</span>
            </div>
            <div className="wl-key">
              <span><i className="work" /> Open work</span>
              <span><i className="cap" /> Capacity</span>
              <span><i className="over" /> Over capacity</span>
            </div>
            {data.workload.every((member) => member.load === 0) ? (
              <div className="empty">
                No open tasks are assigned, so there is no load to show. Assign a task and it appears here.
              </div>
            ) : (
            <div className="workload">
              {data.workload
                .slice()
                .sort((a, b) => b.load - a.load)
                .slice(0, 6)
                .map((member) => (
                  <div key={member.id} className="wl-row">
                    <Avatar name={member.name} hue={member.hue} />
                    <div className="wl-id">
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                    </div>
                    <div className="meter">
                      <i
                        style={{
                          width: `${Math.min(100, (member.load / member.cap) * 100)}%`,
                          background: member.load > member.cap ? "var(--danger)" : undefined,
                        }}
                      />
                    </div>
                    <span className="wl-tick" aria-hidden="true" />
                    <span className="wl-h">{member.load}h <span>/ {member.cap}h</span></span>
                  </div>
                ))}
            </div>
            )}
          </section>
      </div>

      <div className="ins-grid">
        <section className="card glass">
            <div className="card-head">
              <div>
                <h2>On-time delivery</h2>
                <span className="hint">Done before the due date</span>
              </div>
            </div>
            <div className="row" style={{ gap: 14, marginBottom: 10 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {stats.onTime.hasData ? `${stats.onTime.value}%` : "—"}
              </span>
              <span className="dim" style={{ fontSize: 12.5 }}>
                {stats.onTime.hasData
                  ? `${data.onTimeSplit.ok} on time · ${data.onTimeSplit.late} late`
                  : `${data.onTimeSplit.undated} finished without a deadline`}
              </span>
            </div>
            {stats.onTime.hasData ? (
              <>
                <div className="splitbar">
                  <i style={{ width: `${(data.onTimeSplit.ok / totalSplit) * 100}%`, background: "var(--ok)" }} />
                  <i style={{ width: `${(data.onTimeSplit.late / totalSplit) * 100}%`, background: "var(--danger)" }} />
                </div>
                <div className="legend" style={{ marginTop: 12 }}>
                  <div className="li"><i style={{ background: "var(--ok)" }} /> On time <span>{data.onTimeSplit.ok}</span></div>
                  <div className="li"><i style={{ background: "var(--danger)" }} /> Late <span>{data.onTimeSplit.late}</span></div>
                  {data.onTimeSplit.undated > 0 && (
                    <div className="li"><i style={{ background: "var(--text-4)" }} /> No deadline <span>{data.onTimeSplit.undated}</span></div>
                  )}
                </div>
              </>
            ) : (
              <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
                Add a due date to a task and this starts measuring whether work lands on time.
              </p>
            )}
          </section>
      </div>

    </>
  );
}
