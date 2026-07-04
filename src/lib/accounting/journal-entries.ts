import { db } from "@/lib/firebase";
import {
  collection, doc, getDoc, getDocs,
  setDoc, query, where, orderBy, runTransaction, Timestamp,
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
    where("status", "in", ["posted", "void"]),
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
export async function voidJournalEntry(
  id: string,
  reason: string,
  userId: string
): Promise<JournalEntry> {
  // Pre-flight — bail early without burning a journal number on an obviously
  // invalid request (entry missing or already voided).
  const precheck = await getJournalEntry(id);
  if (!precheck) throw new Error(`Journal entry ${id} not found`);
  if (precheck.status !== "posted")
    throw new Error(`Entry ${id} is already ${precheck.status} — cannot void`);

  // getNextJournalNumber() uses its own internal runTransaction (for the
  // sequence counter), which cannot be nested inside another runTransaction.
  // Call it before the outer transaction. Gaps in the sequence are acceptable
  // if the outer transaction fails after all retries.
  const entryNumber  = await getNextJournalNumber();
  const now          = new Date().toISOString();
  const originalRef  = doc(db, "journal_entries", id);
  const reversingRef = doc(collection(db, "journal_entries"));

  let reversingEntry!: JournalEntry;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(originalRef);
    if (!snap.exists()) throw new Error(`Journal entry ${id} not found`);
    const original = { id: snap.id, ...snap.data() } as JournalEntry;

    // Re-validate inside the transaction — closes the race where two concurrent
    // void attempts both pass the pre-flight status check above.
    if (original.status !== "posted")
      throw new Error(`Entry ${id} is already ${original.status} — cannot void`);

    const reversedLines: JournalLineItem[] = original.lineItems.map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName,
      debit:       l.credit,
      credit:      l.debit,
      ...(l.description !== undefined && { description: l.description }),
    }));
    const totalDebit  = round(reversedLines.reduce((s, l) => s + l.debit,  0));
    const totalCredit = round(reversedLines.reduce((s, l) => s + l.credit, 0));

    reversingEntry = {
      id:            reversingRef.id,
      entryNumber,
      entryDate:     original.entryDate,
      description:   `VOID — ${original.description}`,
      ...(original.reference     !== undefined && { reference:     original.reference }),
      referenceType: original.referenceType ?? "manual",
      referenceId:   original.id,
      lineItems:     reversedLines,
      totalDebit,
      totalCredit,
      status:        "posted",
      createdBy:     userId,
      createdAt:     now,
      postedBy:      userId,
      postedAt:      now,
    };

    // Both writes in one transaction — either both commit or neither does.
    tx.update(originalRef, {
      status:     "void",
      voidedBy:   userId,
      voidedAt:   now,
      voidReason: reason,
    });
    tx.set(reversingRef, reversingEntry);
  });

  return reversingEntry;
}
