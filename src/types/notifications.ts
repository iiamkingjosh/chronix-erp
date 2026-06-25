export type NotificationType =
  | "invoice_overdue"
  | "subscription_expiring"
  | "sla_breach"
  | "new_lead"
  | "task_complete"
  | "milestone_complete"
  | "renewal_due"
  | "ticket_assigned"
  | "task_assigned"
  | "lead_assigned"
  | "incident_assigned"
  | "change_assigned"
  | "leave_submitted"
  | "expense_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "expense_approved"
  | "expense_rejected"
  | "invoice_approval_needed"
  | "staff_registered"
  | "vat_filing_due"
  | "wht_remittance_due"
  | "paye_remittance_due"
  | "annual_cit_due"
  | "annual_paye_return_due";

export interface AppNotification {
  id:           string;
  type:         NotificationType;
  title:        string;
  message:      string;
  link?:        string;
  read:         boolean;
  targetRoles:  string[];
  targetUids?:  string[];
  createdAt:    string;
  dedupeKey?:   string;
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  invoice_overdue:         "Invoice Overdue",
  subscription_expiring:   "Subscription Expiring",
  sla_breach:              "SLA Breach",
  new_lead:                "New Lead",
  task_complete:           "Task Complete",
  milestone_complete:      "Milestone Complete",
  renewal_due:             "Renewal Due",
  ticket_assigned:         "Ticket Assigned",
  task_assigned:           "Task Assigned",
  lead_assigned:           "Lead Assigned",
  incident_assigned:       "Incident Assigned",
  change_assigned:         "Change Assigned",
  leave_submitted:         "Leave Submitted",
  expense_submitted:       "Expense Submitted",
  leave_approved:          "Leave Approved",
  leave_rejected:          "Leave Rejected",
  expense_approved:        "Expense Approved",
  expense_rejected:        "Expense Rejected",
  invoice_approval_needed: "Invoice Pending",
  staff_registered:        "New Staff Account",
  vat_filing_due:          "VAT Filing Due",
  wht_remittance_due:      "WHT Remittance Due",
  paye_remittance_due:     "PAYE Remittance Due",
  annual_cit_due:          "Annual CIT Due",
  annual_paye_return_due:  "Annual PAYE Return Due",
};

export const NOTIFICATION_TYPE_STYLES: Record<NotificationType, string> = {
  invoice_overdue:         "bg-red-500/15 text-red-400 border-red-500/30",
  subscription_expiring:   "bg-accent/15 text-accent border-accent/30",
  sla_breach:              "bg-red-500/15 text-red-400 border-red-500/30",
  new_lead:                "bg-secondary/15 text-secondary border-secondary/30",
  task_complete:           "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  milestone_complete:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  renewal_due:             "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ticket_assigned:         "bg-accent/15 text-accent border-accent/30",
  task_assigned:           "bg-accent/15 text-accent border-accent/30",
  lead_assigned:           "bg-accent/15 text-accent border-accent/30",
  incident_assigned:       "bg-accent/15 text-accent border-accent/30",
  change_assigned:         "bg-accent/15 text-accent border-accent/30",
  leave_submitted:         "bg-amber-500/15 text-amber-400 border-amber-500/30",
  expense_submitted:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  leave_approved:          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  leave_rejected:          "bg-red-500/15 text-red-400 border-red-500/30",
  expense_approved:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  expense_rejected:        "bg-red-500/15 text-red-400 border-red-500/30",
  invoice_approval_needed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  staff_registered:        "bg-secondary/15 text-secondary border-secondary/30",
  vat_filing_due:          "bg-amber-500/15 text-amber-400 border-amber-500/30",
  wht_remittance_due:      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paye_remittance_due:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  annual_cit_due:          "bg-amber-500/15 text-amber-400 border-amber-500/30",
  annual_paye_return_due:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  invoice_overdue:         "💳",
  subscription_expiring:   "🔔",
  sla_breach:              "⚠️",
  new_lead:                "👤",
  task_complete:           "✅",
  milestone_complete:      "🏁",
  renewal_due:             "📅",
  ticket_assigned:         "🎫",
  task_assigned:           "📌",
  lead_assigned:           "🤝",
  incident_assigned:       "🚨",
  change_assigned:         "🔄",
  leave_submitted:         "📅",
  expense_submitted:       "💳",
  leave_approved:          "✅",
  leave_rejected:          "❌",
  expense_approved:        "✅",
  expense_rejected:        "❌",
  invoice_approval_needed: "🧾",
  staff_registered:        "🆕",
  vat_filing_due:          "📅",
  wht_remittance_due:      "📅",
  paye_remittance_due:     "📅",
  annual_cit_due:          "📅",
  annual_paye_return_due:  "📅",
};
