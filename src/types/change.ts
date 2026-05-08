export type ChangeType     = "standard" | "normal" | "emergency";
export type ChangeStatus   = "draft" | "pending_approval" | "approved" | "in_progress" | "completed" | "failed" | "cancelled";
export type ChangeRisk     = "low" | "medium" | "high" | "critical";

export interface ChangeEntry {
  id: string;
  changeRef: string;
  title: string;
  description: string;
  type: ChangeType;
  risk: ChangeRisk;
  status: ChangeStatus;
  requestedBy: string;
  requestedByUid: string;
  assignedTo?: string;
  affectedSystems: string;
  rollbackPlan: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  implementedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  postImplementationNotes?: string;
  linkedTickets?: string[];
  createdAt: string;
}

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  standard:  "Standard",
  normal:    "Normal",
  emergency: "Emergency",
};

export const CHANGE_RISK_STYLES: Record<ChangeRisk, string> = {
  low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const CHANGE_STATUS_STYLES: Record<ChangeStatus, string> = {
  draft:            "bg-white/8 text-white/40 border-white/15",
  pending_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved:         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  completed:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed:           "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled:        "bg-white/8 text-white/30 border-white/10",
};

export function generateChangeRef(): string {
  return `CHG-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
