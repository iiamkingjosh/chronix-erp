import { db } from "@/lib/firebase";
import {
  collection, doc, getDoc, getDocs,
  setDoc, query, where, orderBy, runTransaction, Timestamp,
} from "firebase/firestore";
import type { JournalEntry, JournalLineItem } from "@/types/finance";

/* ── Sequential journal number ────────────────────────────────────────────── */

export async function getNextJournalNumber(): Promise<string> {
  const today = new Date();
  const yy    = String(today.getFullYear()).slice(2);
  const mm    = String(today.getMonth() + 1).padStart(2, "0");
  const dd    = String(today.getDate()).padStart(2, "0");
  const prefix = `${yy}${mm}${dd}`;
  const counterRef = doc(db, "metadata", `journalCounter_${prefix}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    if (!snap.exists()) {
      tx.set(counterRef, { lastNumber: 1, date: prefix, createdAt: Timestamp.now(), lastUpdatedAt: Timestamp.now() });
      return 1;
    }
    const n = (snap.data().lastNumber as number) + 1;
    tx.update(counterRef, { lastNumber: n, lastUpdatedAt: Timestamp.now() });
    return n;
  });

  return `JE${prefix}-${String(next).padStart(3, "0")}`;
}

/* ── Create ───────────────────────────────────────────────────────────────── */

export async function createJournalEntry(
  entry: Omit<JournalEntry, "id" | "entryNumber" | "createdAt" | "totalDebit" | "totalCredit">
): Promise<JournalEntry> {
  const totalDebit  = entry.lineItems.reduce((s, l) => s + l.debit,  0);
  const totalCredit = entry.lineItems.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01)
    throw new Error(`Journal entry not balanced: Debits ${totalDebit} ≠ Credits ${totalCredit}`);

  const entryNumber = await getNextJournalNumber();
  const ref         = doc(collection(db, "journal_entries"));
  const now         = new Date().toISOString();

  const journalEntry: JournalEntry = {
    ...entry,
    id: ref.id,
    entryNumber,
    totalDebit,
    totalCredit,
    createdAt: now,
  };

  await setDoc(ref, journalEntry);
  return journalEntry;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  const snap = await getDoc(doc(db, "journal_entries", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as JournalEntry;
}

export async function getJournalEntriesByDateRange(
  startDate: string,
  endDate: string
): Promise<JournalEntry[]> {
  const q = query(
    collection(db, "journal_entries"),
    where("entryDate", ">=", startDate),
    where("entryDate", "<=", endDate),
    where("status", "==", "posted"),
    orderBy("entryDate"),
    orderBy("entryNumber")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry));
}

export async function getJournalEntriesByReference(referenceId: string): Promise<JournalEntry[]> {
  const q = query(
    collection(db, "journal_entries"),
    where("referenceId", "==", referenceId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry));
}
