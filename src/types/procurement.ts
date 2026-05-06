export type VendorStatus   = "active" | "inactive";
export type POStatus       = "pending" | "approved" | "delivered" | "paid" | "cancelled";
export type VendorCategory = "hardware" | "software" | "services" | "consumables" | "logistics" | "other";

export interface VendorRating {
  id: string;
  rating: number;       // 1–5
  comment: string;
  ratedBy: string;
  ratedByName: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  vendorId: string;     // VND-250504-XXXX
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: VendorCategory;
  paymentTerms: string;
  status: VendorStatus;
  ratings: VendorRating[];
  avgRating: number;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface POItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;     // PO-250504-XXXX
  vendorId: string;
  vendorName: string;
  items: POItem[];
  subtotal: number;
  total: number;
  status: POStatus;
  deliveryDate: string;
  notes?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/* ── Labels ── */
export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  hardware:    "Hardware",
  software:    "Software",
  services:    "Services",
  consumables: "Consumables",
  logistics:   "Logistics",
  other:       "Other",
};

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  pending:   "Pending",
  approved:  "Approved",
  delivered: "Delivered",
  paid:      "Paid",
  cancelled: "Cancelled",
};

/* ── Styles ── */
export const PO_STATUS_STYLES: Record<POStatus, string> = {
  pending:   "bg-white/8 text-white/40 border-white/15",
  approved:  "bg-secondary/15 text-secondary border-secondary/30",
  delivered: "bg-accent/15 text-accent border-accent/30",
  paid:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const VENDOR_STATUS_STYLES: Record<VendorStatus, string> = {
  active:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-white/8 text-white/30 border-white/10",
};

export const VENDOR_CATEGORY_STYLES: Record<VendorCategory, string> = {
  hardware:    "bg-secondary/15 text-secondary border-secondary/30",
  software:    "bg-accent/15 text-accent border-accent/30",
  services:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  consumables: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  logistics:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  other:       "bg-white/8 text-white/30 border-white/10",
};

/* ── Helpers ── */
export function generateVendorId(): string {
  const d = new Date();
  return `VND-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function generatePONumber(): string {
  const d = new Date();
  return `PO-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function formatProcDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatProcDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function renderStars(rating: number): string {
  return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
}
