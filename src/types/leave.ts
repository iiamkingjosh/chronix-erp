export type LeaveType = "annual" | "sick" | "maternity" | "paternity" | "emergency" | "study" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  department?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  handoverNotes?: string;
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual:    "Annual Leave",
  sick:      "Sick Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  emergency: "Emergency Leave",
  study:     "Study / Exam Leave",
  unpaid:    "Unpaid Leave",
};

export const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected:  "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-white/8 text-white/30 border-white/15",
};

export function calcLeaveDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}
