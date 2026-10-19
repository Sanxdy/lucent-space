import { useEffect, useId, useRef, useState } from "react";

/** Charts draw in real pixels so label density and height survive the mobile column. */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ---------------------------------- area ---------------------------------- */

export function AreaChart({
  values,
  secondary,
  height = 190,
  color = "var(--accent)",
  labels,
}: {
  values: number[];
  secondary?: number[];
  height?: number;
  color?: string;
  labels?: string[];
}) {
  const id = useId().replace(/:/g, "");
  const [ref, width] = useWidth();
  const pad = { top: 14, right: 8, bottom: labels ? 24 : 6, left: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...values, ...(secondary ?? []));
  const stepX = innerW / Math.max(1, values.length - 1);
  const points = values.map((value, index) => {
    const x = pad.left + index * stepX;
    const y = pad.top + innerH - (value / max) * innerH;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`;
  const ghost = secondary
    ?.map((value, index) => {
      const x = pad.left + index * stepX;
      const y = pad.top + innerH - (value / max) * innerH;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Trend">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + innerH - t * innerH;
          return (
            <g key={t}>
              <line className="gridline" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end">
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}
        {ghost && <path d={ghost} fill="none" stroke="var(--text-4)" strokeWidth={1.4} strokeDasharray="5 4" strokeLinecap="round" />}
        <path d={area} fill={`url(#fill-${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {labels?.map((label, index) => {
          if (index % Math.max(1, Math.ceil(60 / stepX)) !== 0) return null;
          return (
            <text key={label + index} x={pad.left + index * stepX} y={height - 6} textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------------------------- bars ---------------------------------- */

export function Bars({
  values,
  height = 190,
  color = "var(--accent-2)",
  labels,
}: {
  values: number[];
  height?: number;
  color?: string;
  labels?: string[];
}) {
  const [ref, width] = useWidth();
  const pad = { top: 14, right: 8, bottom: labels ? 24 : 6, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...values);
  const step = innerW / Math.max(1, values.length);
  const barW = Math.max(3, Math.min(9, step * 0.42));

  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Hours by day">
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + innerH - t * innerH;
          return (
            <g key={t}>
              <line className="gridline" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end">
                {Math.round(max * t)}h
              </text>
            </g>
          );
        })}
        {values.map((value, index) => {
          const h = (value / max) * innerH;
          return (
            <rect
              key={index}
              x={pad.left + index * step + step / 2 - barW / 2}
              y={pad.top + innerH - h}
              width={barW}
              height={Math.max(value > 0 ? 2 : 0, h)}
              rx={barW / 2}
              fill={color}
            />
          );
        })}
        {labels?.map((label, index) => {
          if (index % Math.max(1, Math.ceil(60 / step)) !== 0) return null;
          return (
            <text key={label + index} x={pad.left + index * step + step / 2} y={height - 6} textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------------------------- donut --------------------------------- */

export function Donut({
  segments,
  size = 132,
  stroke = 16,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--glass-inset)" strokeWidth={stroke} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((segment) => {
          const fraction = total > 0 ? segment.value / total : 0;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, dash - 3)} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return element;
        })}
      </g>
      <text x="50%" y="47%" textAnchor="middle" fill="var(--text)" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font)" }}>
        {total}
      </text>
      <text x="50%" y="60%" textAnchor="middle" fill="var(--text-3)" style={{ fontSize: 9, fontFamily: "var(--font)" }}>
        completed
      </text>
    </svg>
  );
}

/* --------------------------------- burn-up -------------------------------- */

export function Burnup({ done, total, height = 160 }: { done: number[]; total: number[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  const [ref, width] = useWidth();
  const pad = { top: 12, right: 10, bottom: 8, left: 26 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...total, ...done);
  const stepX = innerW / Math.max(1, done.length - 1);
  const line = (values: number[]) =>
    values
      .map((value, index) => {
        const x = pad.left + index * stepX;
        const y = pad.top + innerH - (value / max) * innerH;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div ref={ref} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Progress over time">
        <defs>
          <linearGradient id={`bu-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + innerH - t * innerH;
          return <line key={t} className="gridline" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />;
        })}
        <path d={`${line(done)} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`} fill={`url(#bu-${id})`} />
        <path d={line(total)} fill="none" stroke="var(--text-4)" strokeWidth={1.5} strokeDasharray="4 4" />
        <path d={line(done)} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" />
      </svg>
    </div>
  );
}
