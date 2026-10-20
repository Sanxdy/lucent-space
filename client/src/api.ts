import type { Bootstrap, Insights, Me, Project, Task } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("lucent:session-expired"));
    }
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  me: () => request<{ user: Me | null }>("/auth/me"),
  login: (email: string, password: string) =>
    request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<{ ok: true }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  bootstrap: () => request<Bootstrap>("/bootstrap"),

  createTask: (input: Partial<Task> & { title: string }) =>
    request<{ id: string }>("/tasks", { method: "POST", body: JSON.stringify(input) }),
  patchTask: (id: string, patch: Record<string, unknown>) =>
    request<{ ok: true }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" }),
  addSubtask: (taskId: string, title: string) =>
    request<{ id: string }>(`/tasks/${taskId}/subtasks`, { method: "POST", body: JSON.stringify({ title }) }),
  patchSubtask: (id: string, done: boolean) =>
    request<{ ok: true }>(`/subtasks/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  deleteSubtask: (id: string) => request<{ ok: true }>(`/subtasks/${id}`, { method: "DELETE" }),
  addComment: (taskId: string, body: string) =>
    request<{ id: string }>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),

  createProject: (input: Record<string, unknown>) =>
    request<{ id: string }>("/projects", { method: "POST", body: JSON.stringify(input) }),
  patchProject: (id: string, patch: Partial<Project>) =>
    request<{ ok: true }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  createEvent: (input: Record<string, unknown>) =>
    request<{ id: string }>("/events", { method: "POST", body: JSON.stringify(input) }),
  deleteEvent: (id: string) => request<{ ok: true }>(`/events/${id}`, { method: "DELETE" }),

  patchSettings: (patch: Record<string, unknown>) =>
    request<{ ok: true }>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  patchProfile: (patch: Record<string, unknown>) =>
    request<{ ok: true }>("/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  readNotifications: (ids?: string[]) =>
    request<{ ok: true }>("/notifications/read", { method: "POST", body: JSON.stringify({ ids }) }),
  invite: (input: Record<string, unknown>) =>
    request<{ id: string; temporary_password: string }>("/members", { method: "POST", body: JSON.stringify(input) }),
  removeMember: (id: string) => request<{ ok: true }>(`/members/${id}`, { method: "DELETE" }),
  createTeam: (name: string) =>
    request<{ id: string; name: string }>("/teams", { method: "POST", body: JSON.stringify({ name }) }),
  deleteTeam: (id: string, moveTo?: string) =>
    request<{ ok: true; moved: number }>(`/teams/${id}${moveTo ? `?move_to=${encodeURIComponent(moveTo)}` : ""}`, {
      method: "DELETE",
    }),
  deleteProject: (id: string) => request<{ ok: true; unlinked_tasks: number }>(`/projects/${id}`, { method: "DELETE" }),
  uploadAvatar: (dataUrl: string) =>
    request<{ ok: true; avatar: string }>("/profile/avatar", { method: "POST", body: JSON.stringify({ data_url: dataUrl }) }),
  deleteAvatar: () => request<{ ok: true }>("/profile/avatar", { method: "DELETE" }),
  createCalendarToken: () => request<{ token: string }>("/calendar/token", { method: "POST" }),
  revokeCalendarToken: () => request<{ ok: true }>("/calendar/token", { method: "DELETE" }),
  insights: (range: number) => request<Insights>(`/insights?range=${range}`),
  logFocus: (minutes: number, taskId?: string | null) =>
    request<{ ok: true }>("/focus", { method: "POST", body: JSON.stringify({ minutes, task_id: taskId }) }),
  reset: () => request<{ ok: true }>("/reset", { method: "POST" }),
};
