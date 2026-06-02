export type ProjectStatus = "not_started" | "in_progress" | "on_hold" | "completed";
export type ProjectType   = "web_dev" | "ui_ux" | "it_deployment" | "network" | "support" | "other";
export type TaskStatus    = "todo" | "in_progress" | "done";
export type TaskPriority  = "low" | "medium" | "high";

export interface TeamMember {
  uid: string;
  name: string;
  role: string;
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  assignedName: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface ProjectActivity {
  id: string;
  type: "note" | "status_change" | "milestone_done" | "task_done" | "member_added";
  content: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
}

export interface Project {
  id: string;
  projectId: string;
  name: string;
  clientName: string;
  clientId?: string;
  type: ProjectType;
  description: string;
  status: ProjectStatus;
  team: TeamMember[];
  startDate: string;
  deadline: string;
  milestones: Milestone[];
  tasks: Task[];
  activity: ProjectActivity[];
  progress:    number;
  createdAt:   string;
  createdBy:   string;
  updatedAt:   string;
  files?:      ProjectFile[];
  budget?:     number;
  invoiceId?:  string;
  invoiceRef?: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export const ACCEPTED_FILE_MIME: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "application/zip",
  "application/x-zip-compressed",
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Labels ── */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold:     "On Hold",
  completed:   "Completed",
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  web_dev:       "Web Development",
  ui_ux:         "UI/UX Design",
  it_deployment: "IT Deployment",
  network:       "Network",
  support:       "Support",
  other:         "Other",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo:        "To Do",
  in_progress: "In Progress",
  done:        "Done",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
};

/* ── Styles ── */
export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  not_started: "bg-white/8 text-white/40 border-white/15",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  on_hold:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  completed:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  todo:        "bg-white/8 text-white/30 border-white/10",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  done:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export const TASK_PRIORITY_STYLES: Record<TaskPriority, string> = {
  low:    "bg-white/8 text-white/30 border-white/10",
  medium: "bg-secondary/15 text-secondary border-secondary/30",
  high:   "bg-accent/15 text-accent border-accent/30",
};

/* ── Helpers ── */
export function generateProjectId(): string {
  const d   = new Date();
  const yy  = String(d.getFullYear()).slice(2);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  return `PRJ-${yy}${mm}${dd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function calcProgress(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return Math.round(tasks.filter((t) => t.status === "done").length / tasks.length * 100);
}

export function isDeadlineOverdue(deadline: string): boolean {
  return new Date(deadline + "T23:59:59") < new Date();
}

export function formatProjDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatProjDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function daysUntilDeadline(deadline: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(deadline + "T00:00:00");
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}
