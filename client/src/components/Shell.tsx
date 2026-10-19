import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { Sidebar } from "./Sidebar";
import { Toolbar, routeTitle } from "./Toolbar";
import { CommandPalette } from "./CommandPalette";
import { FocusIsland } from "./FocusIsland";
import { TaskDrawer } from "./TaskDrawer";
import { Tabbar } from "./Tabbar";

export function Shell() {
  const { data, openTaskId } = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const overlayOpen = paletteOpen || openTaskId !== null;

  useEffect(() => {
    let frame = 0;
    let last: { surface: HTMLElement; x: number; y: number } | null = null;
    const paint = () => {
      frame = 0;
      if (!last) return;
      last.surface.style.setProperty("--gx", `${last.x}px`);
      last.surface.style.setProperty("--gy", `${last.y}px`);
    };
    const onMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const surface = target?.closest<HTMLElement>(".glass");
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      last = { surface, x: event.clientX - rect.left, y: event.clientY - rect.top };
      frame ||= requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    const title = routeTitle(location.pathname);
    document.title = title ? `${title} · Lucent` : "Lucent";
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!data) return null;

  return (
    <>
      <a
        href="#main"
        onFocus={() => setSkipVisible(true)}
        onBlur={() => setSkipVisible(false)}
        className={skipVisible ? undefined : "sr-only"}
        style={
          skipVisible
            ? {
                position: "fixed",
                top: 10,
                left: 12,
                zIndex: 120,
                padding: "8px 14px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--glass-thick)",
                color: "var(--text)",
                fontSize: 14,
                fontWeight: 600,
              }
            : undefined
        }
      >
        Skip to content
      </a>
      <div className="wall" />
      <div className="app" inert={overlayOpen}>
        <Sidebar />
        <main id="main" tabIndex={-1} className="main">
          <Toolbar onSearch={() => setPaletteOpen(true)} onNavigate={navigate} />
          <div className="view" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
      <FocusIsland />
      <Tabbar onSearch={() => setPaletteOpen(true)} />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {openTaskId && <TaskDrawer taskId={openTaskId} />}
    </>
  );
}
