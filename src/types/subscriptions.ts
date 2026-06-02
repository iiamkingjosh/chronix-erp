export type SubType     = "domain" | "license" | "contract" | "service" | "ssl" | "other";
export type SubProvider = "namecheap" | "microsoft" | "sophos" | "google" | "aws" | "other";
export type ExpiryBand  = "expired" | "critical" | "warning" | "upcoming" | "active" | "cancelled";

export interface RenewalLog {
  id:           string;
  renewedAt:    string;
  renewedBy:    string;
  renewedByName:string;
  previousExpiry: string;
  newExpiry:    string;
  amount:       number;
  invoiceId?:   string;
  notes?:       string;
}

export interface Subscription {
  id:           string;
  subId:        string;   // SUB-250504-XXXX
  itemName:     string;
  clientName:   string;
  clientId?:    string;
  type:         SubType;
  provider:     string;   // SubProvider or custom string
  startDate:    string;
  expiryDate:   string;
  renewalCost:   number;   // ₦
  vatApplicable: boolean;  // true = apply 7.5% VAT on renewal invoices
  autoRemind:    boolean;
  notes:        string;
  renewalLog:   RenewalLog[];
  cancelled:    boolean;
  createdAt:    string;
  createdBy:    string;
  updatedAt:    string;
}

/* ── Labels ── */
export const SUB_TYPE_LABELS: Record<SubType, string> = {
  domain:   "Domain",
  license:  "License",
  contract: "Contract",
  service:  "Service",
  ssl:      "SSL Certificate",
  other:    "Other",
};

export const SUB_PROVIDER_LABELS: Record<SubProvider, string> = {
  namecheap: "Namecheap",
  microsoft: "Microsoft",
  sophos:    "Sophos",
  google:    "Google",
  aws:       "AWS",
  other:     "Other",
};

export const EXPIRY_BAND_LABELS: Record<ExpiryBand, string> = {
  expired:   "Expired",
  critical:  "Expiring ≤ 7d",
  warning:   "Expiring ≤ 30d",
  upcoming:  "Expiring ≤ 60d",
  active:    "Active",
  cancelled: "Cancelled",
};

/* ── Styles ── */
export const EXPIRY_BAND_STYLES: Record<ExpiryBand, string> = {
  expired:   "bg-red-500/15 text-red-400 border-red-500/30",
  critical:  "bg-accent/15 text-accent border-accent/30",
  warning:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  upcoming:  "bg-secondary/15 text-secondary border-secondary/30",
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-white/8 text-white/30 border-white/10",
};

export const EXPIRY_BAND_CARD_STYLES: Record<ExpiryBand, string> = {
  expired:   "border-red-500/30 bg-red-500/[0.04]",
  critical:  "border-accent/30 bg-accent/[0.04]",
  warning:   "border-amber-500/30 bg-amber-500/[0.04]",
  upcoming:  "border-secondary/30 bg-secondary/[0.04]",
  active:    "border-emerald-500/20 bg-emerald-500/[0.03]",
  cancelled: "border-white/10 bg-white/[0.02]",
};

/* ── Helpers ── */
export function getDaysLeft(expiryDate: string): number {
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
}

export function getExpiryBand(expiryDate: string, cancelled: boolean): ExpiryBand {
  if (cancelled) return "cancelled";
  const days = getDaysLeft(expiryDate);
  if (days < 0)   return "expired";
  if (days <= 7)  return "critical";
  if (days <= 30) return "warning";
  if (days <= 60) return "upcoming";
  return "active";
}

export function formatDaysLeft(days: number): string {
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days < 30) return `${days} days left`;
  if (days < 60) return `${Math.round(days / 7)}w left`;
  return `${Math.round(days / 30)}mo left`;
}

export function generateSubId(): string {
  const d = new Date();
  return `SUB-${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

export function formatSubDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatSubDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
