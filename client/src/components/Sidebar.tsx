import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useStore, useWorkspace } from "../store";
import { Avatar } from "./Avatar";
import {
  IconCalendar,
  IconChevronDown,
  IconHome,
  IconInsights,
  IconLogOut,
  IconMark,
  IconProjects,
  IconSettings,
  IconTasks,
  IconTeam,
  IconUser,
} from "./Icons";

const nav = [
  { to: "/home", label: "Home", Icon: IconHome },
  { to: "/tasks", label: "Tasks", Icon: IconTasks, count: true },
  { to: "/calendar", label: "Calendar", Icon: IconCalendar },
  { to: "/projects", label: "Projects", Icon: IconProjects },
  { to: "/insights", label: "Insights", Icon: IconInsights },
  { to: "/team", label: "Team", Icon: IconTeam },
  { to: "/settings", label: "Settings", Icon: IconSettings },
];

export function Sidebar() {
  const { me, signOut, toast } = useStore();
  const workspace = useWorkspace();
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ y: number; h: number } | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menu]);

  const myOpen = workspace.tasks.filter((task) => task.assignee_id === me?.id && task.status !== "done").length;
  const pinned = workspace.projects.filter((project) => project.pinned).slice(0, 5);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>(".nav-item.active");
    setLens(active ? { y: active.offsetTop, h: active.offsetHeight } : null);
  }, [location.pathname]);

  return (
    <aside className="sidebar glass glass-chrome" aria-label="Primary">
      <Link className="brand" to="/home" aria-label="Lucent home">
        <span className="brand-mark">
          <IconMark size={20} />
        </span>
        <div>
          <div className="brand-name">Lucent</div>
        </div>
      </Link>

      <nav className="nav">
        <div className="nav-track" ref={trackRef}>
          <span
            className={`nav-lens ${lens ? "on" : ""}`}
            style={lens ? { transform: `translateY(${lens.y}px)`, height: lens.h } : undefined}
            aria-hidden
          />
          {nav.map(({ to, label, Icon, count }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {count && myOpen > 0 && <span className="nav-count">{myOpen}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="side-section">
        <div className="side-heading">
          <span>Pinned</span>
        </div>
        {pinned.map((project) => {
          return (
            <NavLink
              key={project.id}
              to={`/projects/${project.id}`}
              className={({ isActive }) => `side-project ${isActive ? "active" : ""}`}
            >
              <span className="pdot" style={{ color: project.color, background: project.color }} />
              <span className="truncate">{project.name}</span>
            </NavLink>
          );
        })}
        {pinned.length === 0 && <div className="side-project dim">No pinned projects</div>}
      </div>

      <div className="side-foot">
        {menu && (
          <div className="account-menu glass glass-thick" ref={menuRef}>
            <NavLink to="/settings/profile" onClick={() => setMenu(false)}>
              <IconUser size={15} /> Profile
            </NavLink>
            <NavLink to="/settings/appearance" onClick={() => setMenu(false)}>
              <IconSettings size={15} /> Appearance
            </NavLink>
            <button
              onClick={async () => {
                setMenu(false);
                try {
                  await signOut();
                  navigate("/login");
                } catch (caught) {
                  toast(caught instanceof Error ? caught.message : "Could not sign out", "error");
                }
              }}
            >
              <IconLogOut size={15} /> Sign out
            </button>
          </div>
        )}
        <button className="account" onClick={() => setMenu((value) => !value)} aria-expanded={menu}>
          <Avatar name={me?.name ?? "You"} hue={me?.hue} />
          <span className="who">
            <strong>{me?.name}</strong>
            <span>{me?.role}</span>
          </span>
          <IconChevronDown size={17} className="acct-caret" />
        </button>
      </div>
    </aside>
  );
}
