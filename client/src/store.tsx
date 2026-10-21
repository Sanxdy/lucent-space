import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import type { Bootstrap, Me, Settings, Task } from "./types";

type Toast = { id: number; text: string; tone: "info" | "error" };
type TimerState = {
  total: number;
  remaining: number;
  running: boolean;
  endsAt: number | null;
  taskId: string | null;
  open: boolean;
};

const TIMER_KEY = "lucent.timer";

const defaultTimer = (minutes: number): TimerState => ({
  total: minutes * 60,
  remaining: minutes * 60,
  running: false,
  endsAt: null,
  taskId: null,
  open: false,
});

function loadTimer(): TimerState {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return defaultTimer(25);
    const saved = JSON.parse(raw) as Partial<TimerState> | null;
    const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
    if (
      !saved ||
      !finite(saved.total) ||
      !finite(saved.remaining) ||
      typeof saved.running !== "boolean" ||
      typeof saved.open !== "boolean" ||
      !(saved.endsAt === null || finite(saved.endsAt)) ||
      !(saved.taskId === null || typeof saved.taskId === "string")
    ) {
      return defaultTimer(25);
    }
    return {
      total: Math.max(0, saved.total as number),
      remaining: Math.max(0, saved.remaining as number),
      running: saved.running,
      endsAt: saved.running ? (saved.endsAt as number | null) : null,
      taskId: (saved.taskId as string | null) ?? null,
      open: saved.open,
    };
  } catch {
    return defaultTimer(25);
  }
}

type Store = {
  data: Bootstrap | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  toast: (text: string, tone?: "info" | "error") => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;

  openTaskId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;

  patchTask: (id: string, patch: Record<string, unknown>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  createTask: (input: Record<string, unknown>) => Promise<string>;
  deleteTask: (id: string) => Promise<void>;
  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string, done: boolean) => Promise<void>;
  removeSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  addComment: (taskId: string, body: string) => Promise<void>;
  createProject: (input: Record<string, unknown>) => Promise<string>;
  updateProject: (id: string, patch: Record<string, unknown>) => Promise<void>;
  createEvent: (input: Record<string, unknown>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  updateProfile: (patch: { name: string; email: string; role: string }) => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  timer: TimerState;
  startFocus: (minutes: number, taskId: string | null) => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  addFive: () => void;
  endFocus: () => void;
  toggleIsland: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerState>(loadTimer);
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const finishing = useRef(false);
  const expired = useRef(false);
  const dataRef = useRef<Bootstrap | null>(null);
  dataRef.current = data;

  const toast = useCallback((text: string, tone: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.bootstrap();
      setData(payload);
      setMe(payload.me);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setMe(null);
        setData(null);
        setError(null);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load your workspace");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user } = await api.me();
        if (!alive) return;
        if (user) {
          setMe(user);
          await refresh();
        }
      } catch (caught) {
        if (alive && !(caught instanceof ApiError && caught.status === 401)) {
          setError(caught instanceof Error ? caught.message : "Could not reach the server");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  /* Keep the workspace current without a reload.
     Another person's edit, a task created through the bot bridge, and a Google Calendar
     refresh all land on the server. A page that reads the server once shows a stale board
     until someone presses reload, so pull again on a slow timer and whenever the tab
     comes back into view. Skipped while hidden, because a background tab does not need
     to keep asking. */
  useEffect(() => {
    if (!me) return;
    let stopped = false;
    const pull = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void refresh();
    };
    const handle = window.setInterval(pull, 12_000);
    document.addEventListener("visibilitychange", pull);
    window.addEventListener("focus", pull);
    return () => {
      stopped = true;
      window.clearInterval(handle);
      document.removeEventListener("visibilitychange", pull);
      window.removeEventListener("focus", pull);
    };
  }, [me, refresh]);

  useEffect(() => {
    const onExpired = () => {
      setMe(null);
      setData(null);
      setOpenTaskId(null);
      setError(null);
      if (expired.current) return;
      expired.current = true;
      toast("Your session expired. Sign in again.", "error");
    };
    window.addEventListener("lucent:session-expired", onExpired);
    return () => window.removeEventListener("lucent:session-expired", onExpired);
  }, [toast]);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    expired.current = false;
    await refresh();
  }, [refresh]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await api.register(name, email, password);
    expired.current = false;
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.logout();
    setMe(null);
    setData(null);
    setOpenTaskId(null);
  }, []);

  /* ------------------------------- settings ------------------------------- */

  useEffect(() => {
    if (!data) return;
    const settings = data.settings;
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.dataset.wall = settings.wall;
      root.dataset.glass = settings.glass;
      root.dataset.accent = settings.accent;
      root.dataset.solid = String(settings.solid);
      localStorage.setItem("lucent:appearance", JSON.stringify(settings));
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#0a0a0c" : "#e9ecf3");
    };
    apply();
    if (settings.theme !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [data]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const previous = dataRef.current?.settings;
    setData((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));
    try {
      await api.patchSettings(patch as Record<string, unknown>);
    } catch (error) {
      if (previous) {
        setData((current) => (current ? { ...current, settings: previous } : current));
      }
      toast(error instanceof Error ? error.message : "Could not save settings", "error");
    }
  }, [toast]);

  const updateProfile = useCallback(async (patch: { name: string; email: string; role: string }) => {
    await api.patchProfile(patch);
    await refresh();
    toast("Profile saved");
  }, [refresh, toast]);

  const markNotificationsRead = useCallback(async () => {
    setData((current) =>
      current ? { ...current, notifications: current.notifications.map((n) => ({ ...n, read: true })) } : current,
    );
    await api.readNotifications().catch(() => undefined);
  }, []);

  /* -------------------------------- tasks --------------------------------- */

  const patchTask = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          if (task.id !== id) return task;
          const next = { ...task, ...patch } as Task;
          /* mirror the server: done_at follows the status */
          if ("status" in patch) next.done_at = next.status === "done" ? (task.done_at ?? new Date().toISOString()) : null;
          return next;
        }),
      };
    });
    try {
      await api.patchTask(id, patch);
      void refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update the task", "error");
      await refresh();
    }
  }, [refresh, toast]);

  const toggleTask = useCallback(async (id: string) => {
    const task = dataRef.current?.tasks.find((t) => t.id === id);
    if (!task) return;
    const done = task.status === "done";
    await patchTask(id, {
      status: done ? "todo" : "done",
      done_at: done ? null : new Date().toISOString(),
    });
  }, [patchTask]);

  const createTask = useCallback(async (input: Record<string, unknown>) => {
    const { id } = await api.createTask(input as { title: string });
    await refresh();
    toast("Task created");
    return id;
  }, [refresh, toast]);

  const deleteTask = useCallback(async (id: string) => {
    await api.deleteTask(id);
    setOpenTaskId(null);
    await refresh();
    toast("Task deleted");
  }, [refresh, toast]);

  const addSubtask = useCallback(async (taskId: string, title: string) => {
    await api.addSubtask(taskId, title);
    await refresh();
  }, [refresh]);

  const toggleSubtask = useCallback(async (taskId: string, subtaskId: string, done: boolean) => {
    setData((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) =>
              task.id === taskId
                ? { ...task, subtasks: task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done } : s)) }
                : task,
            ),
          }
        : current,
    );
    await api.patchSubtask(subtaskId, done).catch(() => refresh());
  }, [refresh]);

  const removeSubtask = useCallback(async (taskId: string, subtaskId: string) => {
    setData((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) =>
              task.id === taskId ? { ...task, subtasks: task.subtasks.filter((s) => s.id !== subtaskId) } : task,
            ),
          }
        : current,
    );
    await api.deleteSubtask(subtaskId).catch(() => refresh());
  }, [refresh]);

  const addComment = useCallback(async (taskId: string, body: string) => {
    await api.addComment(taskId, body);
    await refresh();
  }, [refresh]);

  /* ------------------------------- projects ------------------------------- */

  const createProject = useCallback(async (input: Record<string, unknown>) => {
    const { id } = await api.createProject(input);
    await refresh();
    toast("Project created");
    return id;
  }, [refresh, toast]);

  const updateProject = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setData((current) =>
      current
        ? { ...current, projects: current.projects.map((p) => (p.id === id ? { ...p, ...patch } as typeof p : p)) }
        : current,
    );
    await api.patchProject(id, patch).catch(() => refresh());
  }, [refresh]);

  /* -------------------------------- events -------------------------------- */

  const createEvent = useCallback(async (input: Record<string, unknown>) => {
    await api.createEvent(input);
    await refresh();
    toast("Event added");
  }, [refresh, toast]);

  const removeEvent = useCallback(async (id: string) => {
    await api.deleteEvent(id);
    await refresh();
  }, [refresh]);

  /* --------------------------------- timer -------------------------------- */

  useEffect(() => {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  }, [timer]);

  const savedFocusMinutes = data?.settings.focus_minutes;
  useEffect(() => {
    if (!savedFocusMinutes) return;
    setTimer((current) =>
      current.running || current.remaining !== current.total
        ? current
        : { ...current, total: savedFocusMinutes * 60, remaining: savedFocusMinutes * 60 },
    );
  }, [savedFocusMinutes]);

  const recordFocus = useCallback(async (minutes: number, taskId: string | null) => {
    if (minutes < 1) return;
    await api.logFocus(minutes, taskId).catch(() => undefined);
    setData((current) =>
      current
        ? { ...current, focus: { minutes: current.focus.minutes + minutes, sessions: current.focus.sessions + 1 } }
        : current,
    );
  }, []);

  const finishFocus = useCallback((completed: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    const state = timerRef.current;
    const remaining = state.endsAt
      ? Math.max(0, Math.round((state.endsAt - Date.now()) / 1000))
      : state.remaining;
    const elapsed = Math.round((state.total - remaining) / 60);
    if (completed) {
      toast("Focus session complete. Take a breath.");
      void recordFocus(Math.round(state.total / 60), state.taskId);
      setTimer({ ...defaultTimer(Math.round(state.total / 60)), open: true });
    } else {
      void recordFocus(elapsed, state.taskId);
      setTimer({ ...defaultTimer(Math.round(state.total / 60)), open: false });
    }
    window.setTimeout(() => {
      finishing.current = false;
    }, 300);
  }, [recordFocus, toast]);

  /* one wake-up per second only to detect the end; no state churn while running */
  useEffect(() => {
    if (!timer.running || !timer.endsAt) return;
    const endsAt = timer.endsAt;
    const tick = () => {
      const state = timerRef.current;
      if (state.running && state.endsAt === endsAt && endsAt <= Date.now()) finishFocus(true);
    };
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [timer.running, timer.endsAt, finishFocus]);

  const startFocus = useCallback((minutes: number, taskId: string | null) => {
    setTimer({
      total: minutes * 60,
      remaining: minutes * 60,
      running: true,
      endsAt: Date.now() + minutes * 60_000,
      taskId,
      open: false,
    });
  }, []);

  const pauseFocus = useCallback(() => {
    setTimer((current) => ({
      ...current,
      running: false,
      remaining: current.endsAt
        ? Math.max(0, Math.round((current.endsAt - Date.now()) / 1000))
        : current.remaining,
      endsAt: null,
    }));
  }, []);

  const resumeFocus = useCallback(() => {
    setTimer((current) =>
      current.remaining > 0
        ? { ...current, running: true, endsAt: Date.now() + current.remaining * 1000 }
        : current,
    );
  }, []);

  const addFive = useCallback(() => {
    setTimer((current) => ({
      ...current,
      total: current.total + 300,
      remaining: current.remaining + 300,
      endsAt: current.running && current.endsAt ? current.endsAt + 300_000 : current.endsAt,
    }));
  }, []);

  const endFocus = useCallback(() => finishFocus(false), [finishFocus]);
  const toggleIsland = useCallback(() => setTimer((current) => ({ ...current, open: !current.open })), []);

  const value = useMemo<Store>(() => ({
    data, me, loading, error, retry: refresh, signIn, signUp, signOut, refresh, toast, toasts, dismissToast,
    openTaskId, openTask: setOpenTaskId, closeTask: () => setOpenTaskId(null),
    patchTask, toggleTask, createTask, deleteTask, addSubtask, toggleSubtask, removeSubtask, addComment,
    createProject, updateProject, createEvent, removeEvent, updateSettings, updateProfile, markNotificationsRead,
    timer, startFocus, pauseFocus, resumeFocus, addFive, endFocus, toggleIsland,
  }), [
    data, me, loading, error, refresh, signIn, signUp, signOut, toast, toasts, dismissToast,
    openTaskId, patchTask, toggleTask, createTask, deleteTask, addSubtask, toggleSubtask, removeSubtask, addComment,
    createProject, updateProject, createEvent, removeEvent, updateSettings, updateProfile, markNotificationsRead,
    timer, startFocus, pauseFocus, resumeFocus, addFive, endFocus, toggleIsland,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

export function useWorkspace() {
  const { data } = useStore();
  if (!data) throw new Error("Workspace is not loaded");
  return data;
}

/** Live seconds left; ticks locally so only the timer UI re-renders every second. */
export function useTimerRemaining() {
  const { timer } = useStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer.running || !timer.endsAt) return;
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [timer.running, timer.endsAt]);
  return timer.running && timer.endsAt ? Math.max(0, Math.round((timer.endsAt - now) / 1000)) : timer.remaining;
}

export { ApiError };
