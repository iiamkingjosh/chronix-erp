import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Subscription, RenewalLog } from "@/types/subscriptions";

const SUBS = "subscriptions";

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

export async function renewSubscription(
  subId: string,
  log: RenewalLog,
  newExpiry: string
): Promise<void> {
  await updateDoc(doc(db, SUBS, subId), {
    expiryDate:  newExpiry,
    cancelled:   false,
    renewalLog:  arrayUnion(log),
    updatedAt:   new Date().toISOString(),
  });
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
