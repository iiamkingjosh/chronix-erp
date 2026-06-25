import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, where, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Expense, ExpenseStatus } from "@/types/expense";
import type { Role } from "@/types/roles";
import { ROLES } from "@/types/roles";
import { createExpenseJournalEntry } from "@/lib/accounting/auto-journal";
import { logAuditEvent } from "@/lib/audit-service";
import { createNotification, notifyAssignment } from "@/lib/notifications-service";
import { validateAmount } from "@/lib/utils";

const COL = "expenses";

/** A CFO submitting their own expense doesn't need a second CFO to
 * approve it — there's no one else in the approval chain above them for
 * this purpose. Everyone else's submissions (staff_claim or
 * company_expense, any category) still require CFO approval as before.
 * `submitterRole` is the signed-in submitter's own role, passed by the
 * caller (it's never stored on the expense doc — submittedByUid/By already
 * identify who submitted it; role here is just the auto-approval check). */
export async function createExpense(data: Omit<Expense, "id">, submitterRole?: Role): Promise<Expense> {
  validateAmount(data.amount);

  const isCfoSelfSubmission = submitterRole === ROLES.CFO;
  const now = new Date().toISOString();
  const payload: Omit<Expense, "id"> = isCfoSelfSubmission
    ? { ...data, status: "approved", approvedBy: data.submittedBy, approvedAt: now }
    : data;

  const ref = await addDoc(collection(db, COL), payload);
  const expense = { ...payload, id: ref.id };

  // Nothing is actually "awaiting approval" for a self-approved CFO
  // submission — skip the notification rather than send a misleading one.
  if (!isCfoSelfSubmission) {
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
  }

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

export interface CategoryMonthActuals {
  category:       Expense["category"];
  month:          number; // 1-12
  total:          number;
  staffClaim:     number;
  companyExpense: number;
}

/** Actual spend by category/month/expenseType for one year — feeds the
 * budget-vs-actual report. Only counts "paid" expenses, matching the P&L
 * convention already established in finance/reports/page.tsx ("these
 * match what is journalized into the ledger; approved-but-unpaid are
 * Accounts Payable, not yet cash expenses"). Fetches the full collection
 * and filters/groups client-side, same pattern every other reporting
 * page in this app already uses — no expense-volume concern justifies a
 * different approach (zero real expense records exist in production
 * today). */
export async function getExpenseActualsForYear(year: number): Promise<CategoryMonthActuals[]> {
  const snap = await getDocs(query(collection(db, COL), where("status", "==", "paid")));
  const yearPrefix = String(year);
  const grouped = new Map<string, CategoryMonthActuals>();

  for (const docSnap of snap.docs) {
    const e = docSnap.data() as Expense;
    if (!e.date?.startsWith(yearPrefix)) continue;
    const month = Number(e.date.slice(5, 7));
    const key   = `${e.category}_${month}`;

    if (!grouped.has(key)) {
      grouped.set(key, { category: e.category, month, total: 0, staffClaim: 0, companyExpense: 0 });
    }
    const entry = grouped.get(key)!;
    entry.total += e.amount;
    if (e.expenseType === "staff_claim") entry.staffClaim += e.amount;
    else entry.companyExpense += e.amount;
  }

  return Array.from(grouped.values());
}
