export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planning" | "active" | "review" | "shipped";
export type Wall = "ash" | "smoke" | "dusk" | "aurora" | "bloom" | "ember" | "grove" | "tide";
export type Accent = "blue" | "purple" | "pink" | "orange" | "green" | "teal" | "graphite";

export type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  team: string;
  location: string;
  tz_offset: number;
  hue: number;
  workspace_id: string;
  workspace_name: string;
  is_admin: boolean;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  location: string;
  tz_offset: number;
  hue: number;
  workspace_role: string;
};

export type Subtask = { id: string; task_id: string; title: string; done: boolean; position: number };
export type Comment = { id: string; task_id: string; user_id: string | null; body: string; created_at: string };

export type Task = {
  id: string;
  project_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  estimate: number | null;
  position: number;
  created_at: string;
  done_at: string | null;
  subtasks: Subtask[];
  comments: Comment[];
};

export type Milestone = { id: string; project_id: string; title: string; due_date: string; done: boolean; position: number };

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  due_date: string | null;
  lead_id: string | null;
  pinned: boolean;
  position: number;
  created_at: string;
  task_count: number;
  done_count: number;
  progress: number;
  member_ids: string[];
  next_milestone: Milestone | null;
  milestones: Milestone[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  location: string;
  kind: "meeting" | "review" | "team" | "focus";
  created_by: string | null;
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read: boolean;
};

export type Activity = {
  id: string;
  verb: string;
  subject: string;
  href: string;
  created_at: string;
  user_name: string | null;
  hue: number | null;
};

export type Settings = {
  theme: "light" | "dark" | "auto";
  wall: Wall;
  glass: "tinted" | "clear";
  accent: Accent;
  solid: boolean;
  focus_minutes: number;
  break_minutes: number;
  notify: Record<string, boolean>;
};

export type Bootstrap = {
  me: Me;
  workspace: { id: string; name: string };
  members: Member[];
  projects: Project[];
  tasks: Task[];
  events: CalendarEvent[];
  notifications: Notification[];
  activity: Activity[];
  settings: Settings;
  focus: { minutes: number; sessions: number };
};

export type Insights = {
  range: number;
  stats: {
    completed: { value: number; delta: number };
    onTime: { value: number; delta: number };
    focus: { value: number; delta: number };
    cycle: { value: number; delta: number };
  };
  buckets: string[];
  current: number[];
  previous: number[];
  focusSeries: number[];
  projects: { id: string; name: string; color: string; done: number }[];
  onTimeSplit: { ok: number; late: number };
  workload: { id: string; name: string; hue: number; team: string; role: string; load: number; cap: number; open: number }[];
  slowest: { id: string; title: string; age: number; late: boolean; due_date: string | null }[];
  table: { id: string; title: string; project: string; assignee: string; done_at: string | null; on_time: boolean; estimate: number | null }[];
  weekly: boolean;
};
