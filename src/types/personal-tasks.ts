export type TaskStatus = "todo" | "in_progress" | "done";

export interface PersonalSubtask {
  id: string;
  text: string;
  done: boolean;
}

export interface PersonalTask {
  id: string;
  title: string;
  description?: string;
  subtasks: PersonalSubtask[];
  status: TaskStatus;
  order: number;
  urgency: 1 | 2 | 3;
  importance: 1 | 2 | 3;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const TASK_STATUS_COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo:        "To Do",
  in_progress: "In Progress",
  done:        "Done",
};

export const URGENCY_LABELS: Record<1 | 2 | 3, string>   = { 1: "Low", 2: "Medium", 3: "High" };
export const IMPORTANCE_LABELS: Record<1 | 2 | 3, string> = { 1: "Low", 2: "Medium", 3: "High" };

export const URGENCY_STYLES: Record<1 | 2 | 3, string> = {
  1: "bg-white/8 text-white/40 border-white/10",
  2: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  3: "bg-red-500/10 text-red-400 border-red-500/20",
};

export const IMPORTANCE_STYLES: Record<1 | 2 | 3, string> = {
  1: "bg-white/8 text-white/40 border-white/10",
  2: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  3: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function formatTaskDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
