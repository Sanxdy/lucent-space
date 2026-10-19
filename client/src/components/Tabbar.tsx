import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  IconCalendar,
  IconHome,
  IconInsights,
  IconProjects,
  IconSearch,
  IconSettings,
  IconTasks,
  IconTeam,
} from "./Icons";

const TABS = [
  { to: "/home", label: "Home", Icon: IconHome },
  { to: "/tasks", label: "Tasks", Icon: IconTasks },
  { to: "/calendar", label: "Calendar", Icon: IconCalendar },
  { to: "/projects", label: "Projects", Icon: IconProjects },
];

const MORE = [
  { to: "/insights", label: "Insights", Icon: IconInsights },
  { to: "/team", label: "Team", Icon: IconTeam },
  { to: "/settings", label: "Settings", Icon: IconSettings },
];

const isMore = (path: string) => MORE.some((item) => path.startsWith(item.to));

export function Tabbar({ onSearch }: { onSearch: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);
  const location = useLocation();

  /* lens tracks the active tab; width is exactly one slot */
  useLayoutEffect(() => {
    const track = trackRef.current;
    const lens = lensRef.current;
    if (!track || !lens) return;
    const measure = () => {
      const slot = track.clientWidth / (TABS.length + 1);
      const index = isMore(location.pathname)
        ? TABS.length
        : Math.max(0, TABS.findIndex((tab) => location.pathname.startsWith(tab.to)));
      lens.style.width = `${slot}px`;
      lens.style.transform = `translateX(${index * slot}px)`;
      lens.style.opacity = "1";
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(() => setMore(false), [location.pathname]);

  return (
    <nav className="tabbar" aria-label="Primary">
      {more && (
        <div className="tabbar-more glass glass-thick">
          {MORE.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="palette-item">
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </div>
      )}
      <div className="tabbar__bar glass glass-chrome">
        <div className="tabbar__track" ref={trackRef}>
          <span className="tabbar__lens" ref={lensRef} aria-hidden />
          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="tab" aria-current={location.pathname.startsWith(to) ? "page" : undefined}>
              <Icon size={23} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            className="tab"
            aria-current={isMore(location.pathname) ? "page" : undefined}
            aria-expanded={more}
            onClick={() => setMore((value) => !value)}
          >
            <span className="more-grid" aria-hidden>
              <i /><i /><i /><i />
            </span>
            <span>More</span>
          </button>
        </div>
      </div>
      <button className="tabbar__search glass glass-chrome" onClick={onSearch} aria-label="Search">
        <IconSearch size={24} />
      </button>
    </nav>
  );
}
