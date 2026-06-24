import {
  collection, addDoc, getDocs, doc, query, orderBy, where, limit, runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TimeEntry } from "@/types/timetrack";

const COL = "time_entries";

export async function createTimeEntry(data: Omit<TimeEntry, "id">): Promise<TimeEntry> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getAllTimeEntries(): Promise<TimeEntry[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("date", "desc"), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry));
}

export async function getMyTimeEntries(uid: string): Promise<TimeEntry[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("employeeUid", "==", uid), orderBy("date", "desc"), limit(100))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry));
}

/** Void-the-original + create-the-corrected as one atomic Firestore
 * transaction (D6) - previously two sequential writes that only "happened"
 * to fail safe because void ran first and threw, leaving no orphaned
 * create. That was an accident of call order, not a guarantee: any future
 * reorder, retry-of-just-one-half, or independent call to either step
 * could leave a duplicate, non-voided entry. A transaction makes this
 * structural - both writes commit or neither does, regardless of order or
 * future refactors. Each write's security rule still applies individually
 * at commit time (a transaction doesn't bypass rules) - a privileged
 * non-owner amending someone else's entry still has the void step
 * rejected by firestore.rules' employeeUid==auth.uid check, which now
 * correctly rolls back the create too instead of relying on throw-order. */
export async function amendTimeEntry(
  originalId: string,
  correctedData: Omit<TimeEntry, "id" | "amendedFromId" | "isVoided">,
  _userId: string
): Promise<TimeEntry> {
  const newRef = doc(collection(db, COL));
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, COL, originalId), { isVoided: true });
    tx.set(newRef, {
      ...correctedData,
      amendedFromId: originalId,
      createdAt: new Date().toISOString(),
    });
  });
  return { ...correctedData, id: newRef.id, amendedFromId: originalId };
}
