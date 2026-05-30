export const VAT_RATE = 0.075;

export const COMPANY = {
  name: "Chronix Technology Limited",
  address: "No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos.",
  phone: "+234 91 2664 3718",
  email: "Info@chronixtechnology.com",
  website: "www.chronixtechnology.com",
  bank: {
    name: "Fidelity Bank",
    account: "5601601109",
    accountName: "Chronix Technology Limited",
    tin: "33646874-0001",
  },
} as const;

export type InvoiceStatus   = "pending" | "paid" | "overdue";
export type ApprovalStatus  = "draft" | "pending_approval" | "approved" | "rejected";
export type PaymentMethod   = "bank_transfer" | "cash" | "cheque" | "other";

export interface InvoiceItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  approvalStatus?: ApprovalStatus;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  client: {
    name: string;
    address: string;
    phone: string;
    email?: string;
  };
  sentAt?: string;
  sentTo?: string;
  salesperson: string;
  items: InvoiceItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export const APPROVAL_STATUS_STYLES: Record<ApprovalStatus, string> = {
  draft:            "bg-white/8 text-white/40 border-white/15",
  pending_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected:         "bg-red-500/15 text-red-400 border-red-500/30",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft:            "Draft",
  pending_approval: "Pending Approval",
  approved:         "Approved",
  rejected:         "Rejected",
};

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy: string;
  createdAt: string;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ── ACCOUNTING TYPES ─────────────────────────────────────────────────────── */

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface ChartOfAccount {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  category: string;
  subCategory?: string;
  isActive: boolean;
  parentAccountCode?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface JournalLineItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  reference?: string;
  referenceType?: "invoice" | "payment" | "expense" | "manual";
  referenceId?: string;
  lineItems: JournalLineItem[];
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "posted" | "void";
  createdBy: string;
  createdAt: string;
  postedBy?: string;
  postedAt?: string;
  voidedBy?: string;
  voidedAt?: string;
  voidReason?: string;
}

export type ExpenseCategory = "PURCHASES" | "OPERATING" | "PAYROLL" | "CAPITAL" | "TAX";
export type ExpenseStatus   = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface Expense {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  vendor: string;
  vendorTIN?: string;
  description: string;
  category: ExpenseCategory;
  accountCode: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: "cash" | "bank_transfer" | "card" | "cheque";
  paymentReference?: string;
  receiptURL?: string;
  status: ExpenseStatus;
  submittedBy: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
}

export interface ProfitLossReport {
  id: string;
  reportDate: string;
  period: "monthly" | "quarterly" | "annual";
  startDate: string;
  endDate: string;
  revenue: {
    itConsulting: number;
    networkServices: number;
    hardwareSales: number;
    branding: number;
    softwareDev: number;
    other: number;
    total: number;
  };
  costOfSales: {
    hardwareCost: number;
    directCosts: number;
    subcontractors: number;
    total: number;
  };
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: {
    salaries: number;
    rent: number;
    internet: number;
    fuel: number;
    marketing: number;
    professional: number;
    utilities: number;
    subscriptions: number;
    other: number;
    total: number;
  };
  netProfit: number;
  netMargin: number;
  generatedAt: string;
  generatedBy: string;
}

export interface VATReturn {
  id: string;
  returnNumber: string;
  period: string;
  startDate: string;
  endDate: string;
  vatCollected: {
    itServices: number;
    hardwareSales: number;
    branding: number;
    other: number;
    total: number;
  };
  vatPaid: {
    purchases: number;
    operatingExpenses: number;
    capital: number;
    total: number;
  };
  netVAT: number;
  vatPayable: number;
  vatRefundable: number;
  status: "draft" | "filed" | "paid";
  filedDate?: string;
  paymentDate?: string;
  paymentReference?: string;
  createdAt: string;
  createdBy: string;
}
