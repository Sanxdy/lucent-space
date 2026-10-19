import { useStore, useTimerRemaining, useWorkspace } from "../store";
import { pad } from "../lib/format";
import { IconChevronDown, IconPause, IconPlay, IconX } from "../components/Icons";

function Ring({ size, progress }: { size: number; progress: number }) {
  const circumference = 2 * Math.PI * 9;
  return (
    <span className={`island-ring ${size > 24 ? "island-ring-lg" : ""}`}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <circle className="ring-track" cx={12} cy={12} r={9} />
        <circle
          className="ring-fill"
          cx={12}
          cy={12}
          r={9}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
        />
      </svg>
    </span>
  );
}

export function FocusIsland() {
  const { timer, pauseFocus, resumeFocus, addFive, endFocus, toggleIsland } = useStore();
  const workspace = useWorkspace();
  const remaining = useTimerRemaining();

  const active = timer.running || timer.remaining !== timer.total || timer.endsAt !== null;
  if (!active) return null;

  const progress = timer.total > 0 ? (timer.total - remaining) / timer.total : 0;
  const time = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  const task = timer.taskId ? workspace.tasks.find((item) => item.id === timer.taskId)?.title : null;

  return (
    <div className={`island on ${timer.open ? "open" : ""} ${timer.running ? "" : "paused"}`}>
      <div className="island-body glass glass-thick">
        {!timer.open && (
          <button
            className="island-compact"
            onClick={toggleIsland}
            aria-expanded={false}
            aria-label={`Focus timer, ${time} left. Open controls`}
          >
            <Ring size={22} progress={progress} />
            <span className="island-label">Focus</span>
            <span className="island-time">{time}</span>
          </button>
        )}

        {timer.open && (
          <div className="island-full">
            <div className="island-top">
              <Ring size={40} progress={progress} />
              <div className="island-what">
                <small>{timer.running ? "Focusing on" : "Paused"}</small>
                <b>{task ?? `${Math.round(timer.total / 60)}-minute block`}</b>
              </div>
              <span className="island-big">{time}</span>
            </div>
            <div className="island-ctrls">
              <button className="island-btn island-btn-round" onClick={toggleIsland} aria-label="Minimize timer">
                <IconChevronDown size={18} />
              </button>
              <button className="island-btn" onClick={addFive}>+5 min</button>
              <button
                className="island-btn island-btn-round"
                onClick={timer.running ? pauseFocus : resumeFocus}
                aria-label={timer.running ? "Pause" : "Resume"}
              >
                {timer.running ? <IconPause size={18} /> : <IconPlay size={18} />}
              </button>
              <button className="island-btn island-btn-round island-btn-stop" onClick={endFocus} aria-label="End session">
                <IconX size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
