export type TimeEntryType = "ticket" | "project" | "client" | "internal" | "admin";

export interface TimeEntry {
  id: string;
  employeeUid:  string;
  employeeName: string;
  type:         TimeEntryType;
  linkedId?:    string;
  linkedRef?:   string;
  description:  string;
  date:         string;
  hours:        number;
  billable:     boolean;
  clientName?:  string;
  approvedBy?:  string;
  approvedAt?:  string;
  createdAt:    string;
}

export const TIME_ENTRY_TYPE_LABELS: Record<TimeEntryType, string> = {
  ticket:   "Support Ticket",
  project:  "Project Task",
  client:   "Client Site",
  internal: "Internal",
  admin:    "Admin",
};

export const TIME_ENTRY_TYPE_STYLES: Record<TimeEntryType, string> = {
  ticket:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  project:  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  client:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  internal: "bg-white/8 text-white/40 border-white/15",
  admin:    "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
