export type TaxType        = "VAT" | "WHT" | "PAYE" | "Corporate";
export type TaxAppliesTo   = "invoices" | "vendors" | "payroll" | "all";
export type WHTCertStatus  = "issued" | "pending";

/* ── Tax Rules ─────────────────────────────────────────────── */

export interface TaxRule {
  id:            string;
  taxName:       string;
  taxType:       TaxType;
  rate:          number;       // percentage, e.g. 7.5 for 7.5%
  appliesTo:     TaxAppliesTo;
  isActive:      boolean;
  effectiveDate: string;       // YYYY-MM-DD
  description?:  string;
  createdAt:     string;
  updatedAt:     string;
  createdBy:     string;
}

/* ── VAT Records ────────────────────────────────────────────── */

export interface VATRecord {
  id:         string;
  type:       "collected" | "paid";
  amount:     number;
  sourceType: "invoice" | "purchase_order";
  sourceId:   string;
  sourceRef:  string;          // invoice number or PO ref
  partyName:  string;
  date:       string;          // YYYY-MM-DD
  period:     string;          // YYYY-MM
  createdAt:  string;
}

/* ── Withholding Tax Records ────────────────────────────────── */

export interface WHTRecord {
  id:            string;
  whtId:         string;       // WHT-YYMMDD-XXXX
  vendorName:    string;
  vendorId?:     string;
  invoiceAmount: number;
  whtRate:       number;       // 5 for 5%
  whtAmount:     number;
  paymentDate:   string;       // YYYY-MM-DD
  sourceId?:     string;
  sourceRef?:    string;
  certStatus:    WHTCertStatus;
  notes?:        string;
  createdAt:     string;
  createdBy:     string;
}

/* ── PAYE Records ───────────────────────────────────────────── */

export interface PAYERecord {
  id:           string;
  employeeUid:  string;
  employeeName: string;
  period:       string;        // YYYY-MM
  grossSalary:  number;        // monthly
  annualGross:  number;
  payeAmount:   number;        // monthly PAYE
  annualPAYE:   number;
  payrollRunId?: string;
  createdAt:    string;
}

/* ── Tax Report ─────────────────────────────────────────────── */

export interface TaxReport {
  id:             string;
  type:           TaxType | "Summary";
  period:         string;
  totalCollected: number;
  totalPaid:      number;
  netPayable:     number;
  generatedAt:    string;
  generatedBy:    string;
}

/* ── Styles ─────────────────────────────────────────────────── */

export const TAX_TYPE_STYLES: Record<TaxType, string> = {
  VAT:       "bg-secondary/15 text-secondary border-secondary/30",
  WHT:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PAYE:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Corporate: "bg-accent/15 text-accent border-accent/30",
};

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  VAT:       "Value Added Tax",
  WHT:       "Withholding Tax",
  PAYE:      "PAYE Income Tax",
  Corporate: "Corporate Income Tax",
};

export const WHT_CERT_STYLES: Record<WHTCertStatus, string> = {
  issued:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

/* ── PAYE Calculator (Nigerian bands — annual income) ───────── */

const PAYE_BANDS = [
  { ceiling: 800_000,    rate: 0.00 },
  { ceiling: 3_000_000,  rate: 0.15 },
  { ceiling: 12_000_000, rate: 0.18 },
  { ceiling: 25_000_000, rate: 0.21 },
  { ceiling: 50_000_000, rate: 0.23 },
  { ceiling: Infinity,   rate: 0.25 },
] as const;

export function computeMonthlyPAYE(monthlySalary: number): {
  monthly: number;
  annual: number;
  effectiveRate: number;
} {
  const annual = monthlySalary * 12;
  let annualPAYE = 0;
  let prev = 0;
  let remaining = annual;

  for (const band of PAYE_BANDS) {
    const slice = Math.min(remaining, band.ceiling - prev);
    if (slice <= 0) break;
    annualPAYE += slice * band.rate;
    remaining -= slice;
    prev = band.ceiling;
    if (remaining <= 0) break;
  }

  const monthly = Math.round((annualPAYE / 12) * 100) / 100;
  return {
    monthly,
    annual:        Math.round(annualPAYE * 100) / 100,
    effectiveRate: annual > 0 ? Math.round((annualPAYE / annual) * 10000) / 100 : 0,
  };
}

/* ── Helpers ─────────────────────────────────────────────────── */

export function generateWHTId(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `WHT-${yy}${mm}${dd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function formatTaxDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ytdStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}
