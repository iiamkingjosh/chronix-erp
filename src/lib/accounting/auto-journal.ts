import { createJournalEntry } from "./journal-entries";
import type { Invoice, JournalEntry, JournalLineItem, Payment } from "@/types/finance";
import type { Expense as ExpenseClaim } from "@/types/expense";
import type { PayrollRun } from "@/types/hr";
import type { PurchaseOrder, VendorCategory } from "@/types/procurement";
import type { WHTRecord } from "@/types/tax";
import type { StaffLoan } from "@/types/loans";
import { round } from "@/lib/utils";

/* ── Expense account lookup ───────────────────────────────────────────────── */

const EXPENSE_ACCOUNT: Record<string, { code: string; name: string }> = {
  travel:     { code: "6040", name: "Fuel & Transportation" },
  meals:      { code: "6600", name: "Entertainment & Client Relations" },
  equipment:  { code: "6050", name: "Office Supplies" },
  software:   { code: "6300", name: "Subscriptions (Software, SaaS)" },
  marketing:  { code: "6060", name: "Marketing & Advertising" },
  utilities:  { code: "6200", name: "Utilities (Electricity, Water)" },
  rent:       { code: "6020", name: "Rent" },
  salaries:   { code: "6010", name: "Salaries & Wages" },
  contractor: { code: "6070", name: "Professional Fees (Legal, Accounting)" },
  other:      { code: "6700", name: "Repairs & Maintenance" },
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

/* ── Payment received (cash basis) ──────────────────────────────────────── */
/*
 * Cash-basis: revenue is recognised when cash is received, not at invoicing.
 * No Accounts Receivable (1100) involved — the accrual two-step
 * (DR 1100 at invoice → DR Cash / CR 1100 at payment) collapses into one
 * entry at payment time.
 *
 * Standard (full or partial):
 *   Debit  1010  Cash in Bank      (payment.amount)
 *   Credit 40XX  Revenue per item  (item.lineTotal × ratio, one line per item)
 *   Credit 2100  VAT Payable       (invoice.vatAmount × ratio)
 *
 * VAT-direct (client remits VAT directly to FIRS — never passes through us):
 *   Debit  1010  Cash in Bank      (payment.amount − payment.vatAmount — net received)
 *   Credit 40XX  Revenue per item  (item.lineTotal × ratio — no VAT line)
 *
 * Partial-payment ratio = payment.amount / invoice.total applied uniformly to
 * each revenue line and to vatAmount so the entry always self-balances.
 */
export async function createCashBasisPaymentJournalEntry(
  payment: Payment,
  invoice: Invoice,
  userId: string
): Promise<JournalEntry> {
  const ratio       = invoice.total > 0 ? payment.amount / invoice.total : 1;
  const isVatDirect = payment.method === "vat_direct" && (payment.vatAmount ?? 0) > 0;

  const lineItems: JournalLineItem[] = [];

  if (isVatDirect) {
    const cashReceived = round(payment.amount - (payment.vatAmount ?? 0));
    lineItems.push({
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  cashReceived,
      credit: 0,
      description: `Cash received from ${payment.clientName} (VAT remitted to FIRS by client)`,
    });
    for (const item of invoice.items) {
      const rev = revenueAccount(item.name);
      lineItems.push({
        accountCode: rev.code,
        accountName: rev.name,
        debit:  0,
        credit: round(item.lineTotal * ratio),
        description: item.name,
      });
    }
  } else {
    lineItems.push({
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  round(payment.amount),
      credit: 0,
      description: `Bank transfer received from ${payment.clientName}`,
    });
    for (const item of invoice.items) {
      const rev = revenueAccount(item.name);
      lineItems.push({
        accountCode: rev.code,
        accountName: rev.name,
        debit:  0,
        credit: round(item.lineTotal * ratio),
        description: item.name,
      });
    }
    lineItems.push({
      accountCode: "2100",
      accountName: "VAT Payable (7.5%)",
      debit:  0,
      credit: round((invoice.vatAmount ?? 0) * ratio),
      description: "Output VAT — cash basis",
    });
  }

  return createJournalEntry({
    entryDate:     payment.paymentDate,
    description:   `Payment ${payment.invoiceNumber} — ${payment.clientName}`,
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
  userId: string,
  loanDeductions?: { employeeUid: string; amount: number }[],
): Promise<JournalEntry> {
  const mm         = String(run.month).padStart(2, "0");
  const lastDay    = new Date(run.year, run.month, 0).getDate();
  const entryDate  = `${run.year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  const totalGross   = round(run.entries.reduce((s, e) => s + e.baseSalary, 0));
  const totalPAYE    = round(run.entries.reduce((s, e) => s + (e.payeAmount      ?? 0), 0));
  const totalPension = round(run.entries.reduce((s, e) => s + (e.employeePension ?? 0), 0));
  const totalNHF     = round(run.entries.reduce((s, e) => s + (e.nhf             ?? 0), 0));
  const totalOther   = round(run.entries.reduce((s, e) => s + (e.deductions      ?? 0), 0));
  const totalDeductions    = round(totalPension + totalNHF + totalOther);
  const totalLoanDeductions = loanDeductions && loanDeductions.length > 0
    ? round(loanDeductions.reduce((s, d) => s + d.amount, 0))
    : 0;
  const totalNet = round(totalGross - totalPAYE - totalDeductions - totalLoanDeductions);

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

  if (totalDeductions > 0) {
    lineItems.push({
      accountCode: "2400",
      accountName: "Payroll Deductions Payable",
      debit:  0,
      credit: round(totalDeductions),
      description: `Pension, NHF & other deductions withheld ${mm}/${run.year}`,
    });
  }

  if (totalLoanDeductions > 0) {
    lineItems.push({
      accountCode: "1250",
      accountName: "Staff Loans Receivable",
      debit:  0,
      credit: round(totalLoanDeductions),
      description: `Loan repayments deducted from payroll ${mm}/${run.year}`,
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

/* ── WHT deducted ─────────────────────────────────────────────────────────── */
/*
 * Cash-basis, mirrors the invoice/payment pattern: logging a bill (status
 * "pending") posts nothing — it's safe to edit or delete freely. Only
 * marking it "paid" (tax-service.ts markWHTPaid) calls this and posts one
 * self-contained entry, at that moment, for the actual cash movement.
 *
 * Previously this debited 2010 (Accounts Payable) for the full invoice
 * amount, but nothing ever credited 2010 when the bill was first received —
 * there was no earlier entry to net against, so AP only ever drifted
 * downward into a meaningless balance. Debiting the real expense/COGS
 * account instead is what actually happened: money left the business for
 * a specific operating cost, net of tax withheld.
 *
 *  Debit  6xxx  Expense/COGS account (record.category)  (full invoice amount)
 *  Credit 2200  WHT Payable                              (whtAmount — withheld for FIRS)
 *  Credit 1010  Cash in Bank                              (net amount actually paid to vendor)
 */
export async function createWHTJournalEntry(
  record: WHTRecord,
  userId: string,
  opts?: { invoiceNumber?: string }
): Promise<JournalEntry> {
  if (!record.paymentDate)
    throw new Error(`WHT record ${record.whtId} has no paymentDate — cannot post a journal entry for an unpaid bill.`);

  const description = opts?.invoiceNumber
    ? `WHT deducted — ${record.vendorName} (${opts.invoiceNumber})`
    : `WHT deducted — ${record.vendorName}`;

  const acct = EXPENSE_ACCOUNT[record.category] ?? { code: "6090", name: "Other Operating Expenses" };

  const lineItems: JournalLineItem[] = [
    { accountCode: acct.code, accountName: acct.name,             debit: round(record.invoiceAmount),                          credit: 0,                                              description: `${record.vendorName} — WHT-deducted payment` },
    { accountCode: "2200",    accountName: "WHT Payable",         debit: 0,                                                    credit: round(record.whtAmount),                       description: `WHT ${record.whtRate}% withheld` },
    { accountCode: "1010",    accountName: "Cash in Bank — Fidelity", debit: 0,                                                credit: round(record.invoiceAmount - record.whtAmount), description: `Net payment to ${record.vendorName}` },
  ];

  return createJournalEntry({
    entryDate:     record.paymentDate,
    description,
    reference:     record.whtId,
    referenceType: "manual",
    referenceId:   record.id,
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
    entryDate:     (po.paidAt ?? po.createdAt).slice(0, 10),
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

/* ── Loan disbursed ───────────────────────────────────────────────────────── */
/*
 *  Debit  1250  Staff Loans Receivable  (loan.amount)
 *  Credit 1010  Cash in Bank            (loan.amount)
 */
export async function createLoanDisbursementJournalEntry(
  loan: StaffLoan,
  userId: string,
): Promise<JournalEntry> {
  return createJournalEntry({
    entryDate:     new Date().toISOString().slice(0, 10),
    description:   `Loan disbursed — ${loan.employeeName}`,
    referenceType: "loan_disbursement",
    referenceId:   loan.id,
    lineItems: [
      { accountCode: "1250", accountName: "Staff Loans Receivable",    debit: round(loan.amount), credit: 0,                  description: `Loan to ${loan.employeeName}` },
      { accountCode: "1010", accountName: "Cash in Bank — Fidelity",  debit: 0,                  credit: round(loan.amount), description: `Loan disbursement — ${loan.employeeName}` },
    ],
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Loan early repayment received ───────────────────────────────────────── */
/*
 *  Debit  1010  Cash in Bank            (amount)
 *  Credit 1250  Staff Loans Receivable  (amount)
 */
export async function createEarlyRepaymentJournalEntry(
  amount: number,
  loanId: string,
  employeeName: string,
  userId: string,
): Promise<JournalEntry> {
  return createJournalEntry({
    entryDate:     new Date().toISOString().slice(0, 10),
    description:   `Loan early repayment — ${employeeName}`,
    referenceType: "loan_repayment",
    referenceId:   loanId,
    lineItems: [
      { accountCode: "1010", accountName: "Cash in Bank — Fidelity",  debit: round(amount), credit: 0,            description: `Early repayment — ${employeeName}` },
      { accountCode: "1250", accountName: "Staff Loans Receivable",   debit: 0,             credit: round(amount), description: `Loan settled — ${employeeName}` },
    ],
    status:    "posted",
    createdBy: userId,
    postedBy:  userId,
    postedAt:  new Date().toISOString(),
  });
}
