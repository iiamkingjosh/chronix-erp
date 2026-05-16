import { db } from "@/lib/firebase";
import {
  collection, doc, getDoc, getDocs,
  setDoc, updateDoc, query, where, orderBy,
} from "firebase/firestore";
import { getNextExpenseNumber } from "./expense-counter";
import { createJournalEntry } from "./journal-entries";
import type { Expense, JournalLineItem } from "@/types/finance";

/* ── Create ───────────────────────────────────────────────────────────────── */

export async function createExpense(
  data: Omit<Expense, "id" | "expenseNumber" | "submittedAt" | "status">,
  userId: string
): Promise<Expense> {
  const expenseNumber = await getNextExpenseNumber();
  const ref           = doc(collection(db, "expenses"));
  const expense: Expense = {
    ...data,
    id: ref.id,
    expenseNumber,
    status:      "PENDING",
    submittedAt: new Date().toISOString(),
    submittedBy: userId,
  };
  await setDoc(ref, expense);
  return expense;
}

/* ── Approve ─────────────────────────────────────────────────────────────── */
/*
 *  Debit  6XXX  Expense Account        (amount)
 *  Debit  2110  VAT Recoverable        (VAT paid, if any)
 *  Credit 1010  Cash in Bank           (total paid out)
 */
export async function approveExpense(expenseId: string, approvedBy: string): Promise<void> {
  const ref  = doc(db, "expenses", expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Expense not found");

  const expense = snap.data() as Expense;

  await updateDoc(ref, {
    status:     "APPROVED",
    approvedBy,
    approvedAt: new Date().toISOString(),
  });

  const lineItems: JournalLineItem[] = [
    {
      accountCode: expense.accountCode,
      accountName: expense.description,
      debit:  expense.amount,
      credit: 0,
      description: `Expense to ${expense.vendor}`,
    },
    ...(expense.vatAmount > 0
      ? [{
          accountCode: "2110",
          accountName: "VAT Recoverable (Input)",
          debit:  expense.vatAmount,
          credit: 0,
          description: "Input VAT 7.5%",
        }]
      : []),
    {
      accountCode: "1010",
      accountName: "Cash in Bank — Fidelity",
      debit:  0,
      credit: expense.totalAmount,
      description: `Payment to ${expense.vendor}`,
    },
  ];

  await createJournalEntry({
    entryDate:     expense.expenseDate,
    description:   `Expense ${expense.expenseNumber} — ${expense.vendor}`,
    reference:     expense.expenseNumber,
    referenceType: "expense",
    referenceId:   expense.id,
    lineItems,
    status:    "posted",
    createdBy: approvedBy,
    postedBy:  approvedBy,
    postedAt:  new Date().toISOString(),
  });
}

/* ── Reject ───────────────────────────────────────────────────────────────── */

export async function rejectExpense(expenseId: string, rejectedBy: string, reason: string): Promise<void> {
  await updateDoc(doc(db, "expenses", expenseId), {
    status:          "REJECTED",
    rejectedBy,
    rejectedAt:      new Date().toISOString(),
    rejectionReason: reason,
  });
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function getAllExpenses(): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, "expenses"), orderBy("expenseDate", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getPendingExpenses(): Promise<Expense[]> {
  const q = query(
    collection(db, "expenses"),
    where("status", "==", "PENDING"),
    orderBy("submittedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getExpensesByStatus(status: Expense["status"]): Promise<Expense[]> {
  const q = query(
    collection(db, "expenses"),
    where("status", "==", status),
    orderBy("expenseDate", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}
