import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, useWorkspace } from "../store";
import { useFocusTrap } from "../useFocusTrap";
import {
  IconCalendar,
  IconDownload,
  IconFolderPlus,
  IconHome,
  IconInsights,
  IconLogOut,
  IconMoon,
  IconProjects,
  IconSearch,
  IconSettings,
  IconSun,
  IconTasks,
  IconTeam,
} from "./Icons";
import { TaskModal } from "./CreateModals";

type Item = {
  id: string;
  group: string;
  label: string;
  meta?: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspace();
  const { openTask, signOut, updateSettings, me, toast } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [newTask, setNewTask] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dark = document.documentElement.dataset.theme !== "light";
  useFocusTrap(panelRef, !newTask, onClose);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const list: Item[] = [
      { id: "home", group: "Go to", label: "Home", icon: <IconHome size={15} />, run: go("/home") },
      { id: "tasks", group: "Go to", label: "Tasks", icon: <IconTasks size={15} />, run: go("/tasks") },
      { id: "calendar", group: "Go to", label: "Calendar", icon: <IconCalendar size={15} />, run: go("/calendar") },
      { id: "projects", group: "Go to", label: "Projects", icon: <IconProjects size={15} />, run: go("/projects") },
      { id: "insights", group: "Go to", label: "Insights", icon: <IconInsights size={15} />, run: go("/insights") },
      { id: "team", group: "Go to", label: "Team", icon: <IconTeam size={15} />, run: go("/team") },
      { id: "settings", group: "Go to", label: "Settings", icon: <IconSettings size={15} />, run: go("/settings/profile") },
      {
        id: "new-task",
        group: "Actions",
        label: "Create a task",
        icon: <IconFolderPlus size={15} />,
        run: () => setNewTask(true),
      },
      {
        id: "theme",
        group: "Actions",
        label: dark ? "Switch to light theme" : "Switch to dark theme",
        icon: dark ? <IconSun size={15} /> : <IconMoon size={15} />,
        run: () => {
          void updateSettings({ theme: dark ? "light" : "dark" });
          onClose();
        },
      },
      {
        id: "export",
        group: "Actions",
        label: "Export tasks as CSV",
        icon: <IconDownload size={15} />,
        run: () => {
          window.location.href = "/api/export.csv";
          onClose();
        },
      },
      {
        id: "signout",
        group: "Actions",
        label: "Sign out",
        icon: <IconLogOut size={15} />,
        run: async () => {
          try {
            await signOut();
            navigate("/login");
          } catch (caught) {
            toast(caught instanceof Error ? caught.message : "Could not sign out", "error");
          }
        },
      },
    ];

    for (const project of workspace.projects) {
      list.push({
        id: `p-${project.id}`,
        group: "Projects",
        label: project.name,
        meta: `${project.progress}%`,
        icon: <span className="pdot" style={{ width: 8, height: 8, borderRadius: 99, background: project.color }} />,
        run: go(`/projects/${project.id}`),
      });
    }

    const mine = workspace.tasks.filter((task) => task.status !== "done");
    for (const task of mine) {
      list.push({
        id: `t-${task.id}`,
        group: "Tasks",
        label: task.title,
        meta: task.status.replace("_", " "),
        icon: <IconTasks size={15} />,
        run: () => {
          openTask(task.id);
          onClose();
        },
      });
    }

    const needle = query.trim().toLowerCase();
    if (!needle) return list.filter((item) => item.group === "Go to" || item.group === "Actions").slice(0, 12);
    return list
      .filter((item) => item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle))
      .slice(0, 24);
  }, [workspace, query, dark, navigate, onClose, openTask, signOut, updateSettings, toast]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (newTask) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => Math.min(items.length - 1, value + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        items[index]?.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, index, newTask]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  let lastGroup = "";

  if (newTask) {
    return <TaskModal onClose={() => { setNewTask(false); onClose(); }} />;
  }

  return (
    <>
      <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="palette glass glass-thick" role="dialog" aria-modal="true" aria-label="Search and commands" ref={panelRef}>
          <div className="palette-input">
            <IconSearch size={17} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks, projects, or jump somewhere…"
              aria-label="Search"
            />
            <span className="kbd">esc</span>
          </div>
          <div className="palette-list" ref={listRef}>
            {items.length === 0 && (
              <div className="empty">
                <strong>No matches</strong>
                Try a task title, a project, or “tasks”.
              </div>
            )}
            {items.map((item, itemIndex) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && <div className="palette-group">{header}</div>}
                  <button
                    className={`palette-item ${itemIndex === index ? "sel" : ""}`}
                    data-index={itemIndex}
                    onMouseMove={() => setIndex(itemIndex)}
                    onClick={item.run}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                    {item.meta && <span className="pmeta">{item.meta}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="palette-foot">
            <span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
            <span><span className="kbd">↵</span> open</span>
            <span style={{ marginLeft: "auto" }}>{me?.name}</span>
          </div>
        </div>
      </div>
    </>
  );
}
