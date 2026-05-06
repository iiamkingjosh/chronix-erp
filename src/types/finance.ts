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

export type InvoiceStatus = "pending" | "paid" | "overdue";
export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

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
  client: {
    name: string;
    address: string;
    phone: string;
  };
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateInvoiceNumber(date?: Date): string {
  const d = date ?? new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `CT${yy}${mm}${dd}`;
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
