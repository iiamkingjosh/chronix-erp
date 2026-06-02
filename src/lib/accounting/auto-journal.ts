import { createJournalEntry } from "./journal-entries";
import type { Invoice, JournalEntry, JournalLineItem, Payment } from "@/types/finance";
import type { Expense as ExpenseClaim } from "@/types/expense";
import type { PayrollRun } from "@/types/hr";
import type { PurchaseOrder, VendorCategory } from "@/types/procurement";
import { round } from "@/lib/utils";

/* ── Expense account lookup ───────────────────────────────────────────────── */

const EXPENSE_ACCOUNT: Record<string, { code: string; name: string }> = {
  travel:     { code: "6040", name: "Fuel & Transport" },
  meals:      { code: "6080", name: "Meals & Entertainment" },
  equipment:  { code: "6090", name: "Equipment & Supplies" },
  software:   { code: "6300", name: "Subscriptions & Software" },
  marketing:  { code: "6060", name: "Marketing & Advertising" },
  utilities:  { code: "6200", name: "Utilities" },
  rent:       { code: "6020", name: "Rent & Office Costs" },
  salaries:   { code: "6010", name: "Salaries & Wages" },
  contractor: { code: "6070", name: "Professional & Contractor Fees" },
  other:      { code: "6090", name: "Other Operating Expenses" },
};

/* ── Revenue account lookup ───────────────────────────────────────────────── */

function revenueAccount(itemName: string): { code: string; name: string } {
  const n = itemName.toLowerCase();
  if (n.includes("consulting") || n.includes("advisory"))
    return { code: "4010", name: "IT Consulting Services Revenue" };
  if (n.includes("network") || n.includes("infrastructure"))
    return { code: "4020", name: "Network Infrastructure Revenue" };
  if (n.includes("laptop") || n.includes("hardware") || n.includes("equipment") ||
      n.includes("ssd") || n.includes("ups") || n.includes("cable") || n.includes("mouse"))
    return { code: "4030", name: "Hardware Sales Revenue" };
  if (n.includes("brand") || n.includes("design") || n.includes("logo"))
    return { code: "4040", name: "Branding & Design Revenue" };
  if (n.includes("software") || n.includes("development") || n.includes("app"))
    return { code: "4050", name: "Software Development Revenue" };
  return { code: "4010", name: "IT Consulting Services Revenue" };
}

/* ── Invoice created ─────────────────────────────────────────────────────── */
/*
 *  Debit  1100  Accounts Receivable   (full invoice total)
 *  Credit 40XX  Revenue               (subtotal, net of VAT)
 *  Credit 2100  VAT Payable           (7.5% VAT)
 */
export async function createInvoiceJournalEntry(
  invoice: Invoice,
  userId: string
): Promise<JournalEntry> {

  const lineItems: JournalLineItem[] = [
    // Debit: Full amount owed to us
    {
      accountCode: "1100",
      accountName: "Accounts Receivable",
      debit:  round(invoice.total),
      credit: 0,
      description: `Invoice to ${invoice.client.name}`,
    },
  ];

  // Credit: Revenue broken down by each item
  for (const item of invoice.items) {
    const rev = revenueAccount(item.name);
    lineItems.push({
      accountCode: rev.code,
      accountName: rev.name,
      debit:  0,
      credit: round(item.lineTotal),
      description: item.name,
    });
  }

  // Credit: VAT collected
  lineItems.push({
    accountCode: "2100",
    accountName: "VAT Payable (7.5%)",
    debit:  0,
    credit: round(invoice.vatAmount),
    description: "VAT 7.5% collected",
  });

  return createJournalEntry({
    entryDate:     invoice.invoiceDate,
    description:   `Invoice ${invoice.invoiceNumber} — ${invoice.client.name}`,
    reference:     invoice.invoiceNumber,
    referenceType: "invoice",
    referenceId:   invoice.id,
    lineItems,
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Payment received ────────────────────────────────────────────────────── */
/*
 *  Debit  1010  Cash in Bank          (amount received)
 *  Credit 1100  Accounts Receivable   (clears the debt)
 */
export async function createPaymentJournalEntry(
  payment: Payment,
  userId: string
): Promise<JournalEntry> {
  const lineItems: JournalLineItem[] = [
    {
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  round(payment.amount),
      credit: 0,
      description: "Bank transfer received",
    },
    {
      accountCode: "1100",
      accountName: "Accounts Receivable",
      debit:  0,
      credit: round(payment.amount),
      description: `Payment from ${payment.clientName}`,
    },
  ];

  return createJournalEntry({
    entryDate:     payment.paymentDate,
    description:   `Payment ${payment.id} — ${payment.clientName}`,
    reference:     payment.invoiceNumber,
    referenceType: "payment",
    referenceId:   payment.id,
    lineItems,
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Expense paid ─────────────────────────────────────────────────────────── */
/*
 *  Debit  6xxx  Expense Account   (expense amount)
 *  Credit 1010  Cash in Bank      (expense amount)
 */
export async function createExpenseJournalEntry(
  expense: ExpenseClaim,
  userId: string
): Promise<JournalEntry> {
  const acct = EXPENSE_ACCOUNT[expense.category] ?? { code: "6090", name: "Other Operating Expenses" };

  const lineItems: JournalLineItem[] = [
    {
      accountCode: acct.code,
      accountName: acct.name,
      debit:  round(expense.amount),
      credit: 0,
      description: expense.title,
    },
    {
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  0,
      credit: round(expense.amount),
      description: `Expense payment: ${expense.title}`,
    },
  ];

  return createJournalEntry({
    entryDate:     expense.date,
    description:   `Expense: ${expense.title} — ${expense.submittedBy}`,
    reference:     expense.id,
    referenceType: "expense",
    referenceId:   expense.id,
    lineItems,
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Payroll paid ─────────────────────────────────────────────────────────── */
/*
 *  Debit  6010  Salaries & Wages      (totalGross)
 *  Credit 1010  Cash in Bank          (totalNet — actual cash out)
 *  Credit 2300  PAYE Payable          (PAYE withheld, if any)
 */
export async function createPayrollJournalEntry(
  run: PayrollRun,
  userId: string
): Promise<JournalEntry> {
  const mm         = String(run.month).padStart(2, "0");
  const lastDay    = new Date(run.year, run.month, 0).getDate();
  const entryDate  = `${run.year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  const totalGross = round(run.entries.reduce((s, e) => s + e.baseSalary, 0));
  const totalPAYE  = round(run.entries.reduce((s, e) => s + (e.payeAmount ?? 0), 0));
  const totalOther = round(run.entries.reduce((s, e) => s + (e.deductions ?? 0), 0));
  const totalNet   = round(totalGross - totalPAYE - totalOther);

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  const lineItems: JournalLineItem[] = [
    {
      accountCode: "6010",
      accountName: "Salaries & Wages",
      debit:  round(totalGross),
      credit: 0,
      description: `Payroll ${MONTH_NAMES[run.month - 1]} ${run.year} — ${run.entries.length} employee${run.entries.length !== 1 ? "s" : ""}`,
    },
    {
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  0,
      credit: round(totalNet),
      description: "Net salaries disbursed",
    },
  ];

  if (totalPAYE > 0) {
    lineItems.push({
      accountCode: "2300",
      accountName: "PAYE Payable",
      debit:  0,
      credit: round(totalPAYE),
      description: `PAYE withheld ${mm}/${run.year}`,
    });
  }

  if (totalOther > 0) {
    lineItems.push({
      accountCode: "2010",
      accountName: "Accounts Payable",
      debit:  0,
      credit: round(totalOther),
      description: "Other deductions payable",
    });
  }

  return createJournalEntry({
    entryDate,
    description:   `Payroll ${MONTH_NAMES[run.month - 1]} ${run.year}`,
    reference:     `PAY-${run.year}-${mm}`,
    referenceType: "payroll",
    referenceId:   run.id,
    lineItems,
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Purchase Order paid ──────────────────────────────────────────────────── */
/*
 *  Debit  50XX  COGS Account (hardware→5010, services→5020, software→5030)
 *  Debit  1110  VAT Recoverable    (input VAT, if any)
 *  Credit 1010  Cash in Bank       (po.total)
 */
function poCogsAccount(category?: VendorCategory): { code: string; name: string } {
  if (category === "hardware" || category === "consumables")
    return { code: "5010", name: "Cost of Hardware Sold" };
  if (category === "services" || category === "logistics")
    return { code: "5020", name: "Direct Project Costs" };
  return { code: "5030", name: "Subcontractor Costs" };
}

export async function createPOJournalEntry(
  po: PurchaseOrder,
  userId: string
): Promise<JournalEntry> {
  const cogs    = poCogsAccount(po.vendorCategory);
  const vatAmt  = round(po.vatAmount ?? 0);
  const netCost = round(po.total - vatAmt);

  const lineItems: JournalLineItem[] = [
    {
      accountCode: cogs.code,
      accountName: cogs.name,
      debit:  netCost,
      credit: 0,
      description: `PO ${po.poNumber} — ${po.vendorName}`,
    },
    {
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  0,
      credit: round(po.total),
      description: `Payment to ${po.vendorName}`,
    },
  ];

  if (vatAmt > 0) {
    lineItems.push({
      accountCode: "1110",
      accountName: "VAT Recoverable (Input)",
      debit:  vatAmt,
      credit: 0,
      description: `Input VAT on PO ${po.poNumber}`,
    });
  }

  return createJournalEntry({
    entryDate:     po.createdAt.slice(0, 10),
    description:   `PO ${po.poNumber} — ${po.vendorName}`,
    reference:     po.poNumber,
    referenceType: "manual",
    referenceId:   po.id,
    lineItems,
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}
