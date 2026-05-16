import { createJournalEntry } from "./journal-entries";
import type { Invoice, JournalEntry, JournalLineItem, Payment } from "@/types/finance";

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
      debit:  invoice.total,
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
      credit: item.lineTotal,
      description: item.name,
    });
  }

  // Credit: VAT collected
  lineItems.push({
    accountCode: "2100",
    accountName: "VAT Payable (7.5%)",
    debit:  0,
    credit: invoice.vatAmount,
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
      debit:  payment.amount,
      credit: 0,
      description: "Bank transfer received",
    },
    {
      accountCode: "1100",
      accountName: "Accounts Receivable",
      debit:  0,
      credit: payment.amount,
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
