import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Invoice, Payment, InvoiceStatus, ApprovalStatus } from "@/types/finance";
import { createInvoiceJournalEntry, createPaymentJournalEntry } from "@/lib/accounting/auto-journal";
import { getJournalEntriesByReference, voidJournalEntry } from "@/lib/accounting/journal-entries";
import { logAuditEvent } from "@/lib/audit-service";
import { createNotification } from "@/lib/notifications-service";
import { validateAmount, round, stripUndefined } from "@/lib/utils";

/** Amounts within this tolerance of each other are treated as equal (floating-point rounding). */
const AMOUNT_TOLERANCE = 0.01;

const INV = "invoices";
const PAY = "payments";

export async function createInvoice(data: Omit<Invoice, "id">): Promise<Invoice> {
  validateAmount(data.subtotal, "subtotal");
  validateAmount(data.total, "total");
  const ref     = await addDoc(collection(db, INV), data);
  const invoice = { ...data, id: ref.id };
  try {
    await createInvoiceJournalEntry(invoice, data.createdBy);
    await updateDoc(doc(db, INV, ref.id), { _journalPosted: true, _journalError: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[accounting] Failed to create invoice journal entry:", msg);
    updateDoc(doc(db, INV, ref.id), { _journalError: msg }).catch(() => {});
  }
  logAuditEvent({
    actorUid: data.createdBy, actorName: data.createdBy, actorRole: "Finance",
    action: "create", module: "invoices", entityId: ref.id,
    entityRef: invoice.invoiceNumber,
    details: `Invoice ${invoice.invoiceNumber} created for ${invoice.client.name} — ₦${invoice.total.toLocaleString()}`,
    timestamp: new Date().toISOString(),
  }).catch(() => {});
  return invoice;
}

export async function getInvoices(): Promise<Invoice[]> {
  const snap = await getDocs(query(collection(db, INV), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const snap = await getDoc(doc(db, INV, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Invoice) : null;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  await updateDoc(doc(db, INV, id), { status });
}

/** Cannot reopen an invoice that has any real payment recorded against it —
 * unwinding partial/full payments would require reversing payment journal
 * entries too, not just the original invoice entry, and could understate
 * cash already received. Reopen is for correcting an invoice that was
 * marked paid before any real payment existed (e.g. via handleMarkPaid's
 * manual status flip); the safe correction for anything else is to void
 * this invoice and issue a corrected one. */
export async function reopenInvoice(id: string, actorUid: string): Promise<void> {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("Invoice not found");
  if ((invoice.amountPaid ?? 0) > 0) {
    throw new Error(
      "Cannot reopen an invoice with recorded payments — void this invoice and issue a corrected one instead."
    );
  }

  const entries = await getJournalEntriesByReference(id);
  const voidErrors: string[] = [];
  for (const entry of entries) {
    if (entry.status === "posted") {
      try {
        await voidJournalEntry(entry.id, "Invoice reopened for correction", actorUid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[accounting] Failed to void invoice journal on reopen:", msg);
        voidErrors.push(`${entry.entryNumber}: ${msg}`);
      }
    }
  }

  await updateDoc(doc(db, INV, id), {
    status: "pending",
    _journalVoidError: voidErrors.length ? voidErrors.join("; ") : null,
  });
}

/** Canonical, VAT-exclusive revenue for one invoice. `subtotal` is the
 * source of truth when present; falls back to `total - vatAmount` for
 * documents missing it, then to raw `total` only as a last resort (older
 * records that predate both fields) — never a rate-division estimate,
 * which silently misattributes revenue if the invoice's actual VAT rate
 * ever differed from the assumed standard rate. */
export function getInvoiceRevenue(invoice: { subtotal?: number; total: number; vatAmount?: number }): number {
  if (invoice.subtotal != null) return invoice.subtotal;
  if (invoice.vatAmount != null) return invoice.total - invoice.vatAmount;
  return invoice.total;
}

/** Removes invoice document. Call only for unpaid invoices after UI/auth checks. */
export async function deleteInvoice(id: string): Promise<void> {
  await deleteDoc(doc(db, INV, id));
}

export async function createPayment(data: Omit<Payment, "id">): Promise<Payment> {
  validateAmount(data.amount);
  if (data.vatAmount !== undefined && data.vatAmount > data.amount) {
    throw new Error(`VAT amount (${data.vatAmount}) cannot exceed the payment amount (${data.amount})`);
  }
  const paymentRef = doc(collection(db, PAY));
  const invoiceRef = doc(db, INV, data.invoiceId);

  // Transactional (not batch): deciding the invoice's new status depends on
  // reading its current amountPaid first, and a transaction guarantees that
  // read-then-decide-then-write is atomic against concurrent payments on the
  // same invoice — a plain batch (or a query run before the batch) cannot
  // make that guarantee. Firestore transactions only support single-document
  // reads, which is exactly what this needs (the running total lives on the
  // invoice doc itself, not derived from a cross-collection query).
  await runTransaction(db, async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists()) {
      throw new Error(`Invoice ${data.invoiceId} not found`);
    }
    const invoice = invoiceSnap.data() as Invoice;

    const amountPaidBefore = round(invoice.amountPaid ?? 0);
    const amountPaidAfter  = round(amountPaidBefore + data.amount);

    if (amountPaidAfter - invoice.total > AMOUNT_TOLERANCE) {
      throw new Error(
        `Payment of ${data.amount} would bring total paid to ${amountPaidAfter}, exceeding the invoice total of ${invoice.total}. ` +
        `Record a partial amount, or use a credit/refund process for overpayment — this invoice was not updated.`
      );
    }

    const status: InvoiceStatus =
      amountPaidAfter >= invoice.total - AMOUNT_TOLERANCE ? "paid" : "partially_paid";

    tx.set(paymentRef, stripUndefined(data));
    tx.update(invoiceRef, { status, amountPaid: amountPaidAfter });
  });

  const payment = { ...data, id: paymentRef.id };
  try {
    await createPaymentJournalEntry(payment, data.recordedBy);
    await updateDoc(doc(db, PAY, paymentRef.id), { _journalPosted: true, _journalError: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[accounting] Failed to create payment journal entry:", msg);
    updateDoc(doc(db, PAY, paymentRef.id), { _journalError: msg }).catch(() => {});
  }
  logAuditEvent({
    actorUid: data.recordedBy, actorName: data.recordedBy, actorRole: "Finance",
    action: "create", module: "payments", entityId: paymentRef.id,
    entityRef: data.invoiceNumber,
    details: `Payment recorded for invoice ${data.invoiceNumber} — ₦${data.amount.toLocaleString()} from ${data.clientName}`,
    timestamp: new Date().toISOString(),
  }).catch(() => {});
  return payment;
}

export async function getPayments(): Promise<Payment[]> {
  const snap = await getDocs(query(collection(db, PAY), orderBy("createdAt", "desc"), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}

export async function markInvoiceSent(id: string, sentTo: string): Promise<void> {
  await updateDoc(doc(db, INV, id), {
    sentAt: new Date().toISOString(),
    sentTo,
  });
}

export async function updateInvoiceApproval(
  id: string,
  approvalStatus: ApprovalStatus,
  actorName: string,
  extra?: { rejectionReason?: string; actorUid?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { approvalStatus };
  if (approvalStatus === "pending_approval") { update.submittedBy = actorName; update.submittedAt = now; }
  if (approvalStatus === "approved")  { update.approvedBy = actorName; update.approvedAt = now; }
  if (approvalStatus === "rejected")  { update.rejectedBy = actorName; update.rejectedAt = now; update.rejectionReason = extra?.rejectionReason ?? ""; }
  await updateDoc(doc(db, INV, id), update);

  if (approvalStatus === "rejected") {
    const entries = await getJournalEntriesByReference(id);
    const voidErrors: string[] = [];
    for (const entry of entries) {
      if (entry.status === "posted") {
        try {
          await voidJournalEntry(
            entry.id,
            `Invoice rejected: ${extra?.rejectionReason ?? "no reason given"}`,
            extra?.actorUid ?? actorName,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[accounting] Failed to void invoice journal on rejection:", msg);
          voidErrors.push(`${entry.entryNumber}: ${msg}`);
        }
      }
    }
    // Aggregated across every posted entry so one success doesn't clear the
    // flag for a different entry that failed — visible on the invoice the
    // same way _journalError already flags a failed posting.
    await updateDoc(doc(db, INV, id), {
      _journalVoidError: voidErrors.length ? voidErrors.join("; ") : null,
    }).catch(() => {});
  }

  if (approvalStatus === "pending_approval") {
    const invoice = await getInvoice(id);
    if (invoice) {
      createNotification({
        type:        "invoice_approval_needed",
        title:       "Invoice Awaiting Approval",
        message:     `Invoice ${invoice.invoiceNumber} for ${invoice.client.name} — ₦${invoice.total.toLocaleString()} requires your approval.`,
        link:        `/dashboard/finance/invoices/${id}`,
        read:        false,
        targetRoles: ["Root Admin", "CEO", "CFO"],
        targetUids:  [],
        createdAt:   now,
        dedupeKey:   `invoice-approval-${id}`,
      }).catch(() => {});
    }
  }

  logAuditEvent({
    actorUid: extra?.actorUid ?? actorName, actorName, actorRole: "Finance",
    action: approvalStatus === "approved" ? "approve" : approvalStatus === "rejected" ? "reject" : "update",
    module: "invoices", entityId: id,
    details: `Invoice approval status → ${approvalStatus}${extra?.rejectionReason ? `: ${extra.rejectionReason}` : ""}`,
    timestamp: now,
  }).catch(() => {});
}
