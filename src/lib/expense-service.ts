import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, where, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Expense, ExpenseStatus } from "@/types/expense";
import { createExpenseJournalEntry } from "@/lib/accounting/auto-journal";
import { logAuditEvent } from "@/lib/audit-service";
import { createNotification, notifyAssignment } from "@/lib/notifications-service";
import { validateAmount } from "@/lib/utils";

const COL = "expenses";

export async function createExpense(data: Omit<Expense, "id">): Promise<Expense> {
  validateAmount(data.amount);
  const ref = await addDoc(collection(db, COL), data);
  const expense = { ...data, id: ref.id };

  createNotification({
    type:        "expense_submitted",
    title:       "Expense Awaiting Approval",
    message:     `"${data.title}" — ₦${data.amount.toLocaleString()} submitted by ${data.submittedBy} requires your approval.`,
    link:        `/dashboard/finance/expenses`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "CFO"],
    targetUids:  [],
    createdAt:   new Date().toISOString(),
    dedupeKey:   `expense-approval-${ref.id}`,
  }).catch(() => {});

  return expense;
}

export async function getExpenses(): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("submittedAt", "desc"), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getMyExpenses(uid: string): Promise<Expense[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("submittedByUid", "==", uid), orderBy("submittedAt", "desc"), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function getExpense(id: string): Promise<Expense | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Expense) : null;
}

const EXPENSE_TRANSITIONS: Partial<Record<ExpenseStatus, ExpenseStatus[]>> = {
  pending:  ["approved", "rejected"],
  approved: ["paid", "rejected"],
};

export async function updateExpenseStatus(
  id: string,
  status: ExpenseStatus,
  actorName: string,
  extra?: { rejectionReason?: string; actorUid?: string }
): Promise<void> {
  const current = await getExpense(id);
  if (!current) throw new Error("Expense not found");
  if (!EXPENSE_TRANSITIONS[current.status]?.includes(status)) {
    throw new Error(`Cannot change expense from "${current.status}" to "${status}"`);
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "approved") { update.approvedBy = actorName; update.approvedAt = now; }
  if (status === "rejected") { update.rejectedBy = actorName; update.rejectedAt = now; update.rejectionReason = extra?.rejectionReason ?? ""; }
  if (status === "paid")     { update.paidAt = now; }
  await updateDoc(doc(db, COL, id), update);

  logAuditEvent({
    actorUid: extra?.actorUid ?? actorName, actorName, actorRole: "Finance",
    action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "update",
    module: "expenses", entityId: id,
    details: `Expense status → ${status}${extra?.rejectionReason ? `: ${extra.rejectionReason}` : ""}`,
    timestamp: now,
  }).catch(() => {});

  if (status === "approved" || status === "rejected") {
    const expense = await getExpense(id);
    if (expense?.submittedByUid) {
      if (status === "approved") {
        notifyAssignment({
          type:         "expense_approved",
          title:        "Expense Approved",
          message:      `Your expense "${expense.title}" — ₦${expense.amount.toLocaleString()} has been approved.`,
          link:         `/dashboard/finance/expenses`,
          assigneeUid:  expense.submittedByUid,
          assigneeName: expense.submittedBy,
          dedupeKey:    `expense-approved-${id}`,
        }).catch(() => {});
      } else {
        notifyAssignment({
          type:         "expense_rejected",
          title:        "Expense Rejected",
          message:      `Your expense "${expense.title}" was rejected${extra?.rejectionReason ? `: ${extra.rejectionReason}` : "."}`,
          link:         `/dashboard/finance/expenses`,
          assigneeUid:  expense.submittedByUid,
          assigneeName: expense.submittedBy,
          dedupeKey:    `expense-rejected-${id}`,
        }).catch(() => {});
      }
    }
  }

  if (status === "paid") {
    const expense = await getExpense(id);
    if (expense) {
      if ((expense as unknown as Record<string, unknown>)._journalPosted === true) {
        console.info(`[accounting] Expense ${id} journal already posted — skipping.`);
      } else {
        try {
          await createExpenseJournalEntry(expense, extra?.actorUid ?? actorName);
          await updateDoc(doc(db, COL, id), { _journalPosted: true, _journalError: null });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[accounting] Failed to create expense journal entry:", msg);
          updateDoc(doc(db, COL, id), { _journalError: msg }).catch(() => {});
        }
      }
    }
  }
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
