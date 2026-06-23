export type LeadStage  = "lead" | "prospect" | "client" | "retained";
export type LeadSource = "manual" | "form" | "campaign" | "referral" | "social" | "other";

export interface ActivityEntry {
  id: string;
  type: "note" | "stage_change" | "follow_up" | "follow_up_done" | "conversion" | "assignment";
  content: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  date: string;           // YYYY-MM-DD
  notes: string;
  completedAt?: string;
  createdBy: string;
  createdByName: string;
}

export interface Lead {
  id: string;
  leadId: string;         // LDR-250504-A3B7
  fullName: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  stage: LeadStage;
  assignedTo: string;
  assignedName: string;
  notes: string;
  activity: ActivityEntry[];
  followUps: FollowUp[];
  nextFollowUpDate?: string;
  convertedAt?: string;
  convertedBy?: string;
  clientId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  clientId: string;       // CLT-250504-A3B7
  fullName: string;
  company: string;
  email: string;
  phone: string;
  address?: string;
  leadId?: string;
  notes: string;
  tags: string[];
  assignedTo: string;
  assignedName: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/* ── Labels ── */
export const STAGE_LABELS: Record<LeadStage, string> = {
  lead:     "Lead",
  prospect: "Prospect",
  client:   "Client",
  retained: "Retained",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  manual:   "Manual",
  form:     "Form",
  campaign: "Campaign",
  referral: "Referral",
  social:   "Social Media",
  other:    "Other",
};

/* ── Styles ── */
export const STAGE_STYLES: Record<LeadStage, string> = {
  lead:     "bg-secondary/15 text-secondary border-secondary/30",
  prospect: "bg-accent/15 text-accent border-accent/30",
  client:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  retained: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const STAGE_COLUMN_STYLES: Record<LeadStage, { header: string; card: string; drop: string }> = {
  lead:     { header: "text-secondary border-secondary/30",  card: "border-secondary/20 hover:border-secondary/40",   drop: "ring-secondary/40" },
  prospect: { header: "text-accent border-accent/30",        card: "border-accent/20 hover:border-accent/40",          drop: "ring-accent/40" },
  client:   { header: "text-emerald-400 border-emerald-500/30", card: "border-emerald-500/20 hover:border-emerald-500/40", drop: "ring-emerald-400/40" },
  retained: { header: "text-purple-400 border-purple-500/30",   card: "border-purple-500/20 hover:border-purple-500/40",   drop: "ring-purple-400/40" },
};

export const SOURCE_STYLES: Record<LeadSource, string> = {
  manual:   "bg-white/8 text-white/40 border-white/15",
  form:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  campaign: "bg-accent/15 text-accent border-accent/30",
  referral: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  social:   "bg-pink-500/15 text-pink-400 border-pink-500/30",
  other:    "bg-white/8 text-white/30 border-white/10",
};

/* ── Helpers ── */
export function generateLeadId(): string {
  const d = new Date();
  const yy  = String(d.getFullYear()).slice(2);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  return `LDR-${yy}${mm}${dd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function generateClientId(): string {
  const d = new Date();
  const yy  = String(d.getFullYear()).slice(2);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  return `CLT-${yy}${mm}${dd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function formatCrmDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatCrmDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr + "T23:59:59") < new Date();
}

export function isDueToday(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateStr === today;
}
