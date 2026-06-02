import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Expense, ExpenseStatus } from "@/types/expense";
import { createExpenseJournalEntry } from "@/lib/accounting/auto-journal";

const COL = "expenses";

export async function createExpense(data: Omit<Expense, "id">): Promise<Expense> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getExpenses(): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getMyExpenses(uid: string): Promise<Expense[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("submittedByUid", "==", uid), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getExpense(id: string): Promise<Expense | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Expense) : null;
}

export async function updateExpenseStatus(
  id: string,
  status: ExpenseStatus,
  actorName: string,
  extra?: { rejectionReason?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "approved") { update.approvedBy = actorName; update.approvedAt = now; }
  if (status === "rejected") { update.rejectedBy = actorName; update.rejectedAt = now; update.rejectionReason = extra?.rejectionReason ?? ""; }
  if (status === "paid")     { update.paidAt = now; }
  await updateDoc(doc(db, COL, id), update);

  if (status === "paid") {
    const expense = await getExpense(id);
    if (expense) {
      try {
        await createExpenseJournalEntry(expense, actorName);
        await updateDoc(doc(db, COL, id), { _journalError: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[accounting] Failed to create expense journal entry:", msg);
        updateDoc(doc(db, COL, id), { _journalError: msg }).catch(() => {});
      }
    }
  }
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
