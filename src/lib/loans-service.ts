import {
  collection, doc, getDoc, getDocs, updateDoc, addDoc,
  runTransaction, query, where, orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { StaffLoan, StaffLoanRepayment } from "@/types/loans";
import { stripUndefined } from "@/lib/utils";
import { logAuditEvent } from "@/lib/audit-service";
import {
  createLoanDisbursementJournalEntry,
  createEarlyRepaymentJournalEntry,
} from "@/lib/accounting/auto-journal";

const LOANS      = "staff_loans";
const REPAYMENTS = "staff_loan_repayments";

/* ── Actor name/role helper ───────────────────────────────────────────────── */

async function getActorProfile(userId: string): Promise<{ actorName: string; actorRole: string }> {
  const snap = await getDoc(doc(db, "users", userId));
  const data = snap.data() as Record<string, unknown> | undefined;
  return {
    actorName: (data?.displayName ?? data?.email ?? userId) as string,
    actorRole: (data?.role ?? "") as string,
  };
}

/* ── Apply ────────────────────────────────────────────────────────────────── */

export async function applyForLoan(
  employeeUid:    string,
  employeeName:   string,
  amount:         number,
  repaymentMonths: number,
  reason:         string,
  userId:         string,
): Promise<StaffLoan> {
  if (amount <= 0 || amount > 500_000)
    throw new Error("Loan amount must be between ₦1 and ₦500,000");
  if (repaymentMonths < 4 || repaymentMonths > 24)
    throw new Error("Repayment period must be between 4 and 24 months");

  // ⚠ Composite index required: staff_loans (employeeUid ASC, status ASC)
  const activeSnap = await getDocs(
    query(
      collection(db, LOANS),
      where("employeeUid", "==", employeeUid),
      where("status", "in", ["pending", "approved", "active"]),
    )
  );
  if (!activeSnap.empty)
    throw new Error("Employee already has an active or pending loan");

  const now = new Date().toISOString();
  const monthlyInstalment = Math.round(amount / repaymentMonths);

  type LoanCreateData = Omit<StaffLoan, "id">;
  const data: LoanCreateData = {
    employeeUid,
    employeeName,
    amount,
    amountRepaid:    0,
    balance:         amount,
    status:          "pending",
    repaymentMonths,
    monthlyInstalment,
    carryover:       0,
    reason,
    applicationDate: now.slice(0, 10),
  };
  const ref = await addDoc(collection(db, LOANS), stripUndefined(data));
  return { ...data, id: ref.id };
}

/* ── Approve ──────────────────────────────────────────────────────────────── */

export async function approveLoan(loanId: string, userId: string): Promise<void> {
  const snap = await getDoc(doc(db, LOANS, loanId));
  if (!snap.exists()) throw new Error(`Loan ${loanId} not found`);
  const loan = { id: snap.id, ...snap.data() } as StaffLoan;
  if (loan.status !== "pending")
    throw new Error(`Loan is ${loan.status} — can only approve pending loans`);

  const now = new Date().toISOString();
  await updateDoc(doc(db, LOANS, loanId), stripUndefined({
    status:     "approved" as const,
    approvedBy: userId,
    approvedAt: now,
  }));

  const { actorName, actorRole } = await getActorProfile(userId);
  await logAuditEvent({
    actorUid: userId, actorName, actorRole,
    action:    "approve",
    module:    "hr",
    entityId:  loanId,
    entityRef: loan.employeeName,
    details:   `Loan of ₦${loan.amount.toLocaleString("en-NG")} approved for ${loan.employeeName}`,
    timestamp: now,
  });
}

/* ── Reject ───────────────────────────────────────────────────────────────── */

export async function rejectLoan(loanId: string, reason: string, userId: string): Promise<void> {
  const snap = await getDoc(doc(db, LOANS, loanId));
  if (!snap.exists()) throw new Error(`Loan ${loanId} not found`);
  const loan = { id: snap.id, ...snap.data() } as StaffLoan;
  if (loan.status !== "pending")
    throw new Error(`Loan is ${loan.status} — can only reject pending loans`);

  const now = new Date().toISOString();
  await updateDoc(doc(db, LOANS, loanId), stripUndefined({
    status:          "rejected" as const,
    rejectionReason: reason,
  }));

  const { actorName, actorRole } = await getActorProfile(userId);
  await logAuditEvent({
    actorUid: userId, actorName, actorRole,
    action:    "reject",
    module:    "hr",
    entityId:  loanId,
    entityRef: loan.employeeName,
    details:   `Loan of ₦${loan.amount.toLocaleString("en-NG")} rejected for ${loan.employeeName}. Reason: ${reason}`,
    timestamp: now,
  });
}

/* ── Disburse ─────────────────────────────────────────────────────────────── */

export async function disburseLoan(loanId: string, userId: string): Promise<StaffLoan> {
  const snap = await getDoc(doc(db, LOANS, loanId));
  if (!snap.exists()) throw new Error(`Loan ${loanId} not found`);
  const loan = { id: snap.id, ...snap.data() } as StaffLoan;
  if (loan.status !== "approved")
    throw new Error(`Loan is ${loan.status} — can only disburse approved loans`);

  const now = new Date().toISOString();
  await updateDoc(doc(db, LOANS, loanId), stripUndefined({
    status:      "active" as const,
    disbursedAt: now,
  }));

  const updated: StaffLoan = { ...loan, status: "active", disbursedAt: now };
  await createLoanDisbursementJournalEntry(updated, userId);

  const { actorName, actorRole } = await getActorProfile(userId);
  await logAuditEvent({
    actorUid: userId, actorName, actorRole,
    action:    "update",
    module:    "hr",
    entityId:  loanId,
    entityRef: loan.employeeName,
    details:   `Loan of ₦${loan.amount.toLocaleString("en-NG")} disbursed to ${loan.employeeName}`,
    timestamp: now,
  });

  return updated;
}

/* ── Payroll deduction ────────────────────────────────────────────────────── */

export async function processLoanDeduction(
  loanId:             string,
  payrollRunId:       string,
  netSalaryAvailable: number,
  userId:             string,
): Promise<{ amountDeducted: number; shortfall: number; isCompleted: boolean }> {
  const repaymentRef = doc(collection(db, REPAYMENTS));
  const now = new Date().toISOString();
  let result!: { amountDeducted: number; shortfall: number; isCompleted: boolean };

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(doc(db, LOANS, loanId));
    if (!snap.exists()) throw new Error(`Loan ${loanId} not found`);
    const loan = { id: snap.id, ...snap.data() } as StaffLoan;
    if (loan.status !== "active")
      throw new Error(`Loan is ${loan.status} — can only deduct from active loans`);

    const amountDue      = loan.monthlyInstalment + loan.carryover;
    const amountDeducted = Math.min(amountDue, netSalaryAvailable);
    const shortfall      = amountDue - amountDeducted;
    const newAmountRepaid = loan.amountRepaid + amountDeducted;
    const newBalance     = Math.max(0, loan.balance - amountDeducted);
    const newCarryover   = shortfall;
    const isCompleted    = newBalance <= 0;

    tx.update(doc(db, LOANS, loanId), stripUndefined({
      amountRepaid: newAmountRepaid,
      balance:      newBalance,
      carryover:    newCarryover,
      status:       (isCompleted ? "completed" : "active") as StaffLoan["status"],
      ...(isCompleted ? { completedAt: now } : {}),
    }));

    tx.set(repaymentRef, stripUndefined({
      id:             repaymentRef.id,
      loanId,
      employeeUid:    loan.employeeUid,
      payrollRunId,
      amountDeducted,
      amountDue,
      shortfall,
      repaymentDate:  now,
      type:           "payroll_deduction" as const,
      postedBy:       userId,
    }));

    result = { amountDeducted, shortfall, isCompleted };
  });

  return result;
}

/* ── Early repayment ──────────────────────────────────────────────────────── */

export async function earlyRepayment(loanId: string, userId: string): Promise<StaffLoan> {
  const precheck = await getDoc(doc(db, LOANS, loanId));
  if (!precheck.exists()) throw new Error(`Loan ${loanId} not found`);
  const preLoan = { id: precheck.id, ...precheck.data() } as StaffLoan;
  if (preLoan.status !== "active")
    throw new Error(`Loan is ${preLoan.status} — can only make early repayment on active loans`);

  const currentBalance = preLoan.balance;
  const now = new Date().toISOString();
  const repaymentRef = doc(collection(db, REPAYMENTS));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(doc(db, LOANS, loanId));
    if (!snap.exists()) throw new Error(`Loan ${loanId} not found`);
    const loan = { id: snap.id, ...snap.data() } as StaffLoan;
    if (loan.status !== "active")
      throw new Error(`Loan is ${loan.status} — cannot make early repayment`);

    tx.update(doc(db, LOANS, loanId), {
      amountRepaid: preLoan.amount,
      balance:      0,
      status:       "completed",
      completedAt:  now,
      carryover:    0,
    });

    tx.set(repaymentRef, {
      id:             repaymentRef.id,
      loanId,
      employeeUid:    loan.employeeUid,
      amountDeducted: currentBalance,
      amountDue:      currentBalance,
      shortfall:      0,
      repaymentDate:  now,
      type:           "early_repayment",
      postedBy:       userId,
    });
  });

  await createEarlyRepaymentJournalEntry(currentBalance, loanId, preLoan.employeeName, userId);

  const { actorName, actorRole } = await getActorProfile(userId);
  await logAuditEvent({
    actorUid:  userId,
    actorName,
    actorRole,
    action:    "update",
    module:    "hr",
    entityId:  loanId,
    entityRef: preLoan.employeeName,
    details:   `Early repayment of ₦${currentBalance.toLocaleString("en-NG")} — loan fully settled for ${preLoan.employeeName}`,
    timestamp: now,
  });

  return { ...preLoan, amountRepaid: preLoan.amount, balance: 0, status: "completed", completedAt: now, carryover: 0 };
}

/* ── Queries ──────────────────────────────────────────────────────────────── */

export async function getActiveLoanForEmployee(employeeUid: string): Promise<StaffLoan | null> {
  // ⚠ Composite index required: staff_loans (employeeUid ASC, status ASC)
  const snap = await getDocs(
    query(
      collection(db, LOANS),
      where("employeeUid", "==", employeeUid),
      where("status", "in", ["pending", "approved", "active"]),
    )
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StaffLoan;
}

export async function getAllLoans(): Promise<StaffLoan[]> {
  const snap = await getDocs(
    query(collection(db, LOANS), orderBy("applicationDate", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffLoan));
}

export async function getLoanRepayments(loanId: string): Promise<StaffLoanRepayment[]> {
  // ⚠ Composite index required: staff_loan_repayments (loanId ASC, repaymentDate DESC)
  const snap = await getDocs(
    query(
      collection(db, REPAYMENTS),
      where("loanId", "==", loanId),
      orderBy("repaymentDate", "desc"),
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffLoanRepayment));
}
