import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore, useWorkspace } from "../store";
import { relativeTime } from "../lib/format";
import { Avatar } from "./Avatar";
import { EventModal, ProjectModal, TaskModal } from "./CreateModals";
import {
  IconBell,
  IconCalendar,
  IconCheck,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
  IconFolderPlus,
} from "./Icons";

const ROUTE_TITLE: [string, string][] = [
  ["/home", "Home"],
  ["/tasks", "Tasks"],
  ["/calendar", "Calendar"],
  ["/projects", "Projects"],
  ["/insights", "Insights"],
  ["/team", "Team"],
  ["/settings", "Settings"],
];

export const routeTitle = (path: string) => ROUTE_TITLE.find(([route]) => path.startsWith(route))?.[1];

type Panel = "create" | "notif" | null;

export function Toolbar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate: (to: string) => void }) {
  const { me, updateSettings, markNotificationsRead } = useStore();
  const workspace = useWorkspace();
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<"task" | "project" | "event" | null>(null);
  const [title, setTitle] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const notifRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const dark = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light";
  const unread = workspace.notifications.filter((notification) => !notification.read).length;

  /* the compact title pill appears once the page heading scrolls out of view */
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>(".page-head .title");
    setTitle(routeTitle(location.pathname) ?? "");
    setScrolled(false);
    if (!heading) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting && entry.boundingClientRect.top < 40),
      { rootMargin: "-12px 0px 0px 0px" },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(() => {
    if (!panel) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPanel(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPanel(null);
      (panel === "create" ? createRef.current : notifRef.current)?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const openNotifications = () => {
    const next = panel === "notif" ? null : "notif";
    setPanel(next);
    if (next === "notif" && unread > 0) void markNotificationsRead();
  };

  return (
    <div
      className="toolbar"
      ref={wrapRef}
      onBlur={(event) => {
        if (panel && !event.currentTarget.contains(event.relatedTarget as Node | null)) setPanel(null);
      }}
    >
      <div className={`toolbar-title glass glass-chrome ${scrolled && title ? "show" : ""}`} aria-hidden={!scrolled}>
        <span>{title}</span>
      </div>

      <div className="toolbar-tools glass glass-chrome">
      <button className="searchbtn" onClick={onSearch} aria-label="Search">
        <IconSearch size={20} />
        <span>Search</span>
        <span className="kbd">⌘K</span>
      </button>
      <button
        className="tbtn"
        ref={createRef}
        onClick={() => setPanel(panel === "create" ? null : "create")}
        aria-label="Create"
        aria-haspopup="true"
        aria-expanded={panel === "create"}
      >
        <IconPlus size={22} />
      </button>
      <button
        className="tbtn"
        onClick={() => void updateSettings({ theme: dark ? "light" : "dark" })}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
      >
        {dark ? <IconSun size={22} /> : <IconMoon size={22} />}
      </button>
      <button
        className="tbtn"
        ref={notifRef}
        onClick={openNotifications}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={panel === "notif"}
      >
        <IconBell size={22} />
        {unread > 0 && <span className="dot" />}
      </button>
      <button className="tbtn tbtn--me" onClick={() => onNavigate("/settings/profile")} aria-label="Account">
        <Avatar name={me?.name ?? "You"} hue={me?.hue} avatar={me?.avatar} id={me?.id} size="sm" />
      </button>

      {panel === "create" && (
        <div className="popover glass glass-thick" style={{ width: 220 }}>
          <h4>Create</h4>
          <button className="palette-item" onClick={() => { setPanel(null); setModal("task"); }}>
            <IconTasks size={15} /> New task
          </button>
          <button className="palette-item" onClick={() => { setPanel(null); setModal("project"); }}>
            <IconFolderPlus size={15} /> New project
          </button>
          <button className="palette-item" onClick={() => { setPanel(null); setModal("event"); }}>
            <IconCalendar size={15} /> New event
          </button>
        </div>
      )}

      {panel === "notif" && (
        <div className="popover glass glass-thick">
          <h4>Notifications</h4>
          {workspace.notifications.length === 0 && <div className="empty">Nothing new. Enjoy the quiet.</div>}
          {workspace.notifications.map((notification) => (
            <button
              key={notification.id}
              className="notif"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => {
                setPanel(null);
                onNavigate(notification.href || "/home");
              }}
            >
              <Avatar name={notification.title} hue={210} size="sm" />
              <span className="nbody">
                <p>{notification.body}</p>
                <span>{relativeTime(notification.created_at)}</span>
              </span>
              {!notification.read && <span className="unread" />}
            </button>
          ))}
          <div className="row" style={{ padding: "6px 8px 2px", color: "var(--text-3)", fontSize: 12 }}>
            <IconCheck size={13} /> Marked as read when you open this
          </div>
        </div>
      )}

      {modal === "task" && <TaskModal onClose={() => setModal(null)} />}
      {modal === "project" && <ProjectModal onClose={() => setModal(null)} />}
      {modal === "event" && <EventModal onClose={() => setModal(null)} />}
      </div>
    </div>
  );
}
