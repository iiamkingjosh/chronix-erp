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
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Invoice, Payment, InvoiceStatus, ApprovalStatus } from "@/types/finance";
import { createInvoiceJournalEntry, createPaymentJournalEntry } from "@/lib/accounting/auto-journal";
import { logAuditEvent } from "@/lib/audit-service";

const INV = "invoices";
const PAY = "payments";

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export async function createInvoice(data: Omit<Invoice, "id">): Promise<Invoice> {
  const ref     = await addDoc(collection(db, INV), data);
  const invoice = { ...data, id: ref.id };
  try {
    await createInvoiceJournalEntry(invoice, data.createdBy);
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

/** Removes invoice document. Call only for unpaid invoices after UI/auth checks. */
export async function deleteInvoice(id: string): Promise<void> {
  await deleteDoc(doc(db, INV, id));
}

export async function createPayment(data: Omit<Payment, "id">): Promise<Payment> {
  const batch      = writeBatch(db);
  const paymentRef = doc(collection(db, PAY));
  const invoiceRef = doc(db, INV, data.invoiceId);

  batch.set(paymentRef, stripUndefined(data));
  batch.update(invoiceRef, { status: "paid" as const });

  await batch.commit();

  const payment = { ...data, id: paymentRef.id };
  try {
    await createPaymentJournalEntry(payment, data.recordedBy);
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
  const snap = await getDocs(query(collection(db, PAY), orderBy("createdAt", "desc")));
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
  logAuditEvent({
    actorUid: extra?.actorUid ?? actorName, actorName, actorRole: "Finance",
    action: approvalStatus === "approved" ? "approve" : approvalStatus === "rejected" ? "reject" : "update",
    module: "invoices", entityId: id,
    details: `Invoice approval status → ${approvalStatus}${extra?.rejectionReason ? `: ${extra.rejectionReason}` : ""}`,
    timestamp: now,
  }).catch(() => {});
}
