import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { round } from "./utils";
import { createInvoice } from "./finance-service";
import { getNextInvoiceNumber } from "./invoiceCounter";
import type { Subscription, RenewalLog } from "@/types/subscriptions";
import type { Invoice } from "@/types/finance";

const SUBS = "subscriptions";

// arrayUnion() rejects literal `undefined` inside the object being unioned
// (unlike top-level field omission on a plain update). Same small helper
// already used in finance-service.ts for the same reason.
function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export async function createSubscription(data: Omit<Subscription, "id">): Promise<Subscription> {
  const ref = await addDoc(collection(db, SUBS), data);
  return { ...data, id: ref.id };
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const snap = await getDocs(query(collection(db, SUBS), orderBy("expiryDate", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));
}

export async function getSubscription(id: string): Promise<Subscription | null> {
  const snap = await getDoc(doc(db, SUBS, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Subscription) : null;
}

export interface RenewSubscriptionParams {
  newExpiry:     string;
  amount:        number;
  notes?:        string;
  renewedBy:     string;
  renewedByName: string;
}

/**
 * Renews a subscription and, if a renewal amount is recorded, creates the
 * matching invoice — as one fail-clean unit. The invoice is created FIRST;
 * if that throws, this function throws too and NOTHING below it ever
 * runs, so expiryDate/cancelled/renewalLog are left completely untouched —
 * no partial renewal, no orphaned journal entry. This is sequencing, not a
 * literal Firestore transaction, deliberately: unlike createPayment (D6),
 * there's no shared/contended numeric field here that needs read-then-
 * write atomicity against concurrent calls — only "don't commit step 2 if
 * step 1 never succeeded," which plain control flow already guarantees in
 * single-threaded async code.
 */
export async function renewSubscription(
  subId: string,
  params: RenewSubscriptionParams,
): Promise<{ subscription: Subscription; invoice: Invoice | null }> {
  const sub = await getSubscription(subId);
  if (!sub) throw new Error(`Subscription ${subId} not found`);

  const now = new Date().toISOString();
  let invoice: Invoice | null = null;

  if (params.amount > 0) {
    const invoiceNumber = await getNextInvoiceNumber();
    const subtotal  = round(params.amount);
    const applyVat  = sub.vatApplicable !== false;
    const vatAmount = applyVat ? round(subtotal * 0.075) : 0;
    const vatRate   = applyVat ? 0.075 : 0;
    const total     = round(subtotal + vatAmount);

    invoice = await createInvoice({
      invoiceNumber,
      invoiceDate:    now.split("T")[0],
      dueDate:        params.newExpiry,
      status:         "pending",
      approvalStatus: "draft",
      client:         { name: sub.clientName || "Unknown", address: "", phone: "" },
      salesperson:    params.renewedByName,
      items: [{ id: "1", name: `${sub.itemName} — Renewal`, unitPrice: subtotal, quantity: 1, lineTotal: subtotal }],
      subtotal,
      vatRate,
      vatAmount,
      total,
      notes:      `Auto-generated from subscription renewal ${sub.subId ?? sub.id}`,
      createdAt:  now,
      createdBy:  params.renewedBy,
    });
  }

  const log: RenewalLog = {
    id:             crypto.randomUUID(),
    renewedAt:      now,
    renewedBy:      params.renewedBy,
    renewedByName:  params.renewedByName,
    previousExpiry: sub.expiryDate,
    newExpiry:      params.newExpiry,
    amount:         params.amount,
    invoiceId:      invoice?.id,
    notes:          params.notes,
  };

  await updateDoc(doc(db, SUBS, subId), {
    expiryDate:  params.newExpiry,
    cancelled:   false,
    renewalLog:  arrayUnion(stripUndefined(log)),
    ...(invoice ? { invoiceIds: arrayUnion(invoice.id) } : {}),
    updatedAt:   now,
  });

  return {
    subscription: {
      ...sub,
      expiryDate: params.newExpiry,
      cancelled:  false,
      renewalLog: [...sub.renewalLog, log],
      invoiceIds: invoice ? [...(sub.invoiceIds ?? []), invoice.id] : sub.invoiceIds,
    },
    invoice,
  };
}

export async function cancelSubscription(subId: string): Promise<void> {
  await updateDoc(doc(db, SUBS, subId), {
    cancelled:  true,
    updatedAt:  new Date().toISOString(),
  });
}

export async function updateSubscriptionNotes(subId: string, notes: string): Promise<void> {
  await updateDoc(doc(db, SUBS, subId), { notes, updatedAt: new Date().toISOString() });
}

export async function toggleAutoRemind(subId: string, autoRemind: boolean): Promise<void> {
  await updateDoc(doc(db, SUBS, subId), { autoRemind, updatedAt: new Date().toISOString() });
}

export async function setVatApplicable(subId: string, vatApplicable: boolean): Promise<void> {
  await updateDoc(doc(db, SUBS, subId), { vatApplicable, updatedAt: new Date().toISOString() });
}
