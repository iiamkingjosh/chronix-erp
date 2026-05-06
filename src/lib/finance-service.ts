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
import type { Invoice, Payment, InvoiceStatus } from "@/types/finance";

const INV = "invoices";
const PAY = "payments";

export async function createInvoice(data: Omit<Invoice, "id">): Promise<Invoice> {
  const ref = await addDoc(collection(db, INV), data);
  return { ...data, id: ref.id };
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
  const batch = writeBatch(db);
  const paymentRef = doc(collection(db, PAY));
  const invoiceRef = doc(db, INV, data.invoiceId);

  batch.set(paymentRef, data);
  batch.update(invoiceRef, { status: "paid" as const });

  await batch.commit();

  return { ...data, id: paymentRef.id };
}

export async function getPayments(): Promise<Payment[]> {
  const snap = await getDocs(query(collection(db, PAY), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}
