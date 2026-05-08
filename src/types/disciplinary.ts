export type DiscAction = "verbal_warning" | "written_warning" | "final_warning" | "suspension" | "dismissal" | "query" | "grievance";
export type DiscStatus = "open" | "resolved" | "escalated" | "dismissed";

export interface DiscEntry {
  id: string;
  employeeUid: string;
  employeeName: string;
  department?: string;
  action: DiscAction;
  subject: string;
  description: string;
  status: DiscStatus;
  issuedBy: string;
  issuedAt: string;
  employeeResponse?: string;
  responseAt?: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export const DISC_ACTION_LABELS: Record<DiscAction, string> = {
  verbal_warning:  "Verbal Warning",
  written_warning: "Written Warning",
  final_warning:   "Final Warning",
  suspension:      "Suspension",
  dismissal:       "Dismissal",
  query:           "Query",
  grievance:       "Grievance",
};

export const DISC_ACTION_STYLES: Record<DiscAction, string> = {
  verbal_warning:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  written_warning: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  final_warning:   "bg-red-500/15 text-red-400 border-red-500/30",
  suspension:      "bg-red-700/15 text-red-500 border-red-700/30",
  dismissal:       "bg-red-900/15 text-red-600 border-red-900/30",
  query:           "bg-blue-500/15 text-blue-400 border-blue-500/30",
  grievance:       "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const DISC_STATUS_STYLES: Record<DiscStatus, string> = {
  open:      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  escalated: "bg-red-500/15 text-red-400 border-red-500/30",
  dismissed: "bg-white/8 text-white/30 border-white/15",
};
