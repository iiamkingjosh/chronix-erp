import { db } from "@/lib/firebase";
import {
  collection, doc, getDoc, getDocs,
  setDoc, updateDoc, query, where, orderBy,
} from "firebase/firestore";
import { getNextExpenseNumber } from "./expense-counter";
import type { Expense, ExpenseStatus } from "@/types/expense";

/* ── Create ───────────────────────────────────────────────────────────────── */

export async function createExpense(
  data: Omit<Expense, "id" | "submittedAt" | "status">,
  userId: string
): Promise<Expense> {
  await getNextExpenseNumber(); // reserve number (unused on canonical type — kept for counter integrity)
  const ref     = doc(collection(db, "expenses"));
  const expense = {
    ...data,
    id:            ref.id,
    status:        "pending" as const,
    submittedAt:   new Date().toISOString(),
    submittedBy:   data.submittedBy   || userId,
    submittedByUid: data.submittedByUid || userId,
  } as Expense;
  await setDoc(ref, expense);
  return expense;
}

/* ── Approve ─────────────────────────────────────────────────────────────── */
/* Journal entry is NOT posted here — it is created when the expense is marked
   "paid" in expense-service.ts. Approving records an obligation, not a cash
   movement; posting cash before payment would be incorrect on cash-basis books. */

export async function approveExpense(expenseId: string, approvedBy: string): Promise<void> {
  const ref  = doc(db, "expenses", expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Expense not found");

  await updateDoc(ref, {
    status:     "approved",
    approvedBy,
    approvedAt: new Date().toISOString(),
  });
}

/* ── Reject ───────────────────────────────────────────────────────────────── */

export async function rejectExpense(expenseId: string, rejectedBy: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "expenses", expenseId), {
    status:          "rejected",
    rejectedBy,
    rejectedAt:      new Date().toISOString(),
    rejectionReason: reason,
  });
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function getAllExpenses(): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, "expenses"), orderBy("submittedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getPendingExpenses(): Promise<Expense[]> {
  const snap = await getDocs(
    query(collection(db, "expenses"), where("status", "==", "pending"), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getExpensesByStatus(status: ExpenseStatus): Promise<Expense[]> {
  const snap = await getDocs(
    query(collection(db, "expenses"), where("status", "==", status), orderBy("submittedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}
