export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus   = "open" | "in_progress" | "resolved" | "closed";
export type NoteType       = "note" | "status_change" | "assignment" | "resolution";

export interface TicketNote {
  id: string;
  authorUid: string;
  authorName: string;
  content: string;
  type: NoteType;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketId: string;       // TKT-250504-A3B7
  client: {
    name: string;
    contact: string;
  };
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string;     // uid
  assignedName: string;
  slaDeadline: string;    // ISO datetime
  notes: TicketNote[];
  clientFeedback?: string;
  resolvedAt?: string;
  closedAt?: string;
  escalatedAt?: string;
  escalatedTo?: string;
  escalationLevel?: 1 | 2 | 3;
  escalationReason?: string;
  onCallAssigned?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/* ── Labels ── */
export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low:      "Low",
  medium:   "Medium",
  high:     "High",
  critical: "Critical",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        "Open",
  in_progress: "In Progress",
  resolved:    "Resolved",
  closed:      "Closed",
};

/* ── Color tokens ── */
export const PRIORITY_STYLES: Record<TicketPriority, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high:     "bg-accent/15 text-accent border-accent/30",
  medium:   "bg-secondary/15 text-secondary border-secondary/30",
  low:      "bg-white/8 text-white/40 border-white/15",
};

export const STATUS_STYLES: Record<TicketStatus, string> = {
  open:        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  closed:      "bg-white/8 text-white/30 border-white/15",
};

/* ── SLA helpers ── */
export const SLA_HOURS: Record<TicketPriority, number> = {
  critical: 4,
  high:     24,
  medium:   48,
  low:      72,
};

export function defaultSlaDeadline(priority: TicketPriority, from?: Date): string {
  const d = from ?? new Date();
  d.setHours(d.getHours() + SLA_HOURS[priority]);
  return d.toISOString();
}

export type SlaStatus = "breached" | "critical" | "warning" | "ok" | "resolved";

export function getSlaStatus(slaDeadline: string, status: TicketStatus): SlaStatus {
  if (status === "resolved" || status === "closed") return "resolved";
  const now       = new Date();
  const deadline  = new Date(slaDeadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < 0)  return "breached";
  if (hoursLeft < 1)  return "critical";
  if (hoursLeft < 4)  return "warning";
  return "ok";
}

export const SLA_STATUS_STYLES: Record<SlaStatus, string> = {
  breached: "bg-red-500/15 text-red-400 border-red-500/30",
  critical: "bg-red-500/10 text-red-300 border-red-500/20",
  warning:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ok:       "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  resolved: "bg-white/8 text-white/30 border-white/15",
};

export function formatTimeLeft(slaDeadline: string): string {
  const now      = new Date();
  const deadline = new Date(slaDeadline);
  const ms       = deadline.getTime() - now.getTime();
  if (ms < 0) {
    const h = Math.abs(Math.floor(ms / 3_600_000));
    const m = Math.abs(Math.floor((ms % 3_600_000) / 60_000));
    return `Breached ${h}h ${m}m ago`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${m}m left`;
}

export function generateTicketId(): string {
  const d   = new Date();
  const yy  = String(d.getFullYear()).slice(2);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  const sfx = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${yy}${mm}${dd}-${sfx}`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
