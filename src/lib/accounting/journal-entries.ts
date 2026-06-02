import { db } from "@/lib/firebase";
import {
  collection, doc, getDoc, getDocs,
  setDoc, updateDoc, query, where, orderBy, runTransaction, Timestamp,
} from "firebase/firestore";
import type { JournalEntry, JournalLineItem } from "@/types/finance";
import { round } from "@/lib/utils";

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
  const totalDebit  = round(entry.lineItems.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round(entry.lineItems.reduce((s, l) => s + l.credit, 0));

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

/* ── Void ────────────────────────────────────────────────────────────────── */
/**
 * Voids a posted journal entry by:
 * 1. Marking the original entry status = "void"
 * 2. Posting a reversing entry (all debits/credits swapped) with the same date
 *
 * Journal entries are immutable by Firestore rules — this is the only correct
 * way to correct an error in the ledger.
 */
export async function voidJournalEntry(
  id: string,
  reason: string,
  userId: string
): Promise<JournalEntry> {
  const original = await getJournalEntry(id);
  if (!original) throw new Error(`Journal entry ${id} not found`);
  if (original.status !== "posted")
    throw new Error(`Entry ${id} is already ${original.status} — cannot void`);

  const now = new Date().toISOString();

  // Mark original as voided
  await updateDoc(doc(db, "journal_entries", id), {
    status:     "void",
    voidedBy:   userId,
    voidedAt:   now,
    voidReason: reason,
  });

  // Post reversing entry
  const reversedLines: JournalLineItem[] = original.lineItems.map((l) => ({
    accountCode:  l.accountCode,
    accountName:  l.accountName,
    debit:        l.credit,   // swap
    credit:       l.debit,    // swap
    description:  l.description,
  }));

  return createJournalEntry({
    entryDate:     original.entryDate,
    description:   `VOID — ${original.description}`,
    reference:     original.reference,
    referenceType: original.referenceType ?? "manual",
    referenceId:   original.id,
    lineItems:     reversedLines,
    status:        "posted",
    createdBy:     userId,
    postedBy:      userId,
    postedAt:      now,
  });
}
