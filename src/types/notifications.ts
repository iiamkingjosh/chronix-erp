export type NotificationType =
  | "invoice_overdue"
  | "subscription_expiring"
  | "sla_breach"
  | "new_lead"
  | "task_complete"
  | "milestone_complete"
  | "renewal_due";

export interface AppNotification {
  id:          string;
  type:        NotificationType;
  title:       string;
  message:     string;
  link?:       string;
  read:        boolean;
  targetRoles: string[];
  createdAt:   string;
  dedupeKey?:  string;
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  invoice_overdue:       "Invoice Overdue",
  subscription_expiring: "Subscription Expiring",
  sla_breach:            "SLA Breach",
  new_lead:              "New Lead",
  task_complete:         "Task Complete",
  milestone_complete:    "Milestone Complete",
  renewal_due:           "Renewal Due",
};

export const NOTIFICATION_TYPE_STYLES: Record<NotificationType, string> = {
  invoice_overdue:       "bg-red-500/15 text-red-400 border-red-500/30",
  subscription_expiring: "bg-accent/15 text-accent border-accent/30",
  sla_breach:            "bg-red-500/15 text-red-400 border-red-500/30",
  new_lead:              "bg-secondary/15 text-secondary border-secondary/30",
  task_complete:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  milestone_complete:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  renewal_due:           "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  invoice_overdue:       "💳",
  subscription_expiring: "🔔",
  sla_breach:            "⚠️",
  new_lead:              "👤",
  task_complete:         "✅",
  milestone_complete:    "🏁",
  renewal_due:           "📅",
};
