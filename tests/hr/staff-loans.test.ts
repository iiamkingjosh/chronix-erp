import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "../helpers/admin-emulator";
import {
  connectEmulators, clearAll, teardownEmulators,
  signInAs, readDocAsAdmin, queryAsAdmin, signOutCurrent, seedDoc,
} from "../helpers/emulator";
import {
  applyForLoan, approveLoan, rejectLoan, disburseLoan,
  processLoanDeduction, earlyRepayment, getLoanRepayments,
} from "@/lib/loans-service";
import { getDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { StaffLoan, StaffLoanRepayment } from "@/types/loans";

beforeAll(async () => { await connectEmulators(); });
beforeEach(async () => { await clearAll(); await signOutCurrent(); });
afterAll(async () => { await teardownEmulators(); });

/**
 * Helper: applies for a loan as a new Staff user, then signs in as Root Admin
 * to approve + disburse. Leaves auth signed in as Root Admin on return.
 */
async function createActiveLoan(amount: number, months: number): Promise<{
  loanId: string;
  employeeUid: string;
  rootUid: string;
  monthlyInstalment: number;
}> {
  const { uid: staffUid } = await signInAs("Staff");
  const loan = await applyForLoan(staffUid, "Test Employee", amount, months, "test reason", staffUid);
  const { uid: rootUid } = await signInAs("Root Admin");
  await approveLoan(loan.id, rootUid);
  await disburseLoan(loan.id, rootUid);
  return { loanId: loan.id, employeeUid: staffUid, rootUid, monthlyInstalment: loan.monthlyInstalment };
}

// ── Test 1 ────────────────────────────────────────────────────────────────────
describe("1 — applyForLoan rejects amount > ₦500,000", () => {
  it("throws with amount 500,001", async () => {
    const { uid } = await signInAs("Staff");
    await expect(
      applyForLoan(uid, "Test", 500_001, 12, "reason", uid)
    ).rejects.toThrow("₦500,000");
  });
});

// ── Test 2 ────────────────────────────────────────────────────────────────────
describe("2 — applyForLoan rejects repaymentMonths < 4", () => {
  it("throws when months is 3", async () => {
    const { uid } = await signInAs("Staff");
    await expect(
      applyForLoan(uid, "Test", 100_000, 3, "reason", uid)
    ).rejects.toThrow();
  });
});

// ── Test 3 ────────────────────────────────────────────────────────────────────
describe("3 — applyForLoan rejects repaymentMonths > 24", () => {
  it("throws when months is 25", async () => {
    const { uid } = await signInAs("Staff");
    await expect(
      applyForLoan(uid, "Test", 100_000, 25, "reason", uid)
    ).rejects.toThrow();
  });
});

// ── Test 4 ────────────────────────────────────────────────────────────────────
describe("4 — pending loan blocks second application", () => {
  it("throws when employee already has a pending loan", async () => {
    const { uid } = await signInAs("Staff");
    await applyForLoan(uid, "Test", 50_000, 6, "first application", uid);
    await expect(
      applyForLoan(uid, "Test", 30_000, 4, "second application", uid)
    ).rejects.toThrow();
  });
});

// ── Test 5 ────────────────────────────────────────────────────────────────────
describe("5 — active loan blocks second application", () => {
  it("throws when employee already has an active loan (seeded directly)", async () => {
    const { uid } = await signInAs("Staff");
    // Seed an active loan for this uid without going through the approval flow
    await seedDoc("staff_loans", "seed-active", {
      employeeUid: uid, employeeName: "Test Employee",
      amount: 50_000, amountRepaid: 0, balance: 50_000,
      status: "active", repaymentMonths: 6,
      monthlyInstalment: 8334, carryover: 0,
      reason: "existing loan", applicationDate: "2026-01-01",
    });
    await expect(
      applyForLoan(uid, "Test", 30_000, 4, "new application", uid)
    ).rejects.toThrow();
  });
});

// ── Test 6 ────────────────────────────────────────────────────────────────────
describe("6 — full approval flow: pending → approved → active + disbursement journal entry", () => {
  it("status transitions correctly; disburseLoan posts DR 1250 / CR 1010", async () => {
    const { uid: staffUid } = await signInAs("Staff");
    const loan = await applyForLoan(staffUid, "Alice", 120_000, 12, "car", staffUid);
    expect(loan.status).toBe("pending");

    const { uid: rootUid } = await signInAs("Root Admin");
    await approveLoan(loan.id, rootUid);

    const afterApprove = await readDocAsAdmin<StaffLoan>("staff_loans", loan.id);
    expect(afterApprove?.status).toBe("approved");
    expect(afterApprove?.approvedBy).toBe(rootUid);

    const active = await disburseLoan(loan.id, rootUid);
    expect(active.status).toBe("active");

    const afterDisburse = await readDocAsAdmin<StaffLoan>("staff_loans", loan.id);
    expect(afterDisburse?.status).toBe("active");
    expect(afterDisburse?.disbursedAt).toBeDefined();

    // Journal entry: referenceType="loan_disbursement", DR 1250 / CR 1010
    type JE = { lineItems: Array<{ accountCode: string; debit: number; credit: number }> };
    const jes = await queryAsAdmin<JE>("journal_entries", "referenceId", loan.id);
    expect(jes).toHaveLength(1);
    const items = jes[0]!.lineItems;
    const dr1250 = items.find((l) => l.accountCode === "1250" && l.debit > 0);
    const cr1010 = items.find((l) => l.accountCode === "1010" && l.credit > 0);
    expect(dr1250).toBeDefined();
    expect(cr1010).toBeDefined();
    expect(dr1250!.debit).toBe(120_000);
    expect(cr1010!.credit).toBe(120_000);
  });
});

// ── Test 7 ────────────────────────────────────────────────────────────────────
describe("7 — rejectLoan sets status to 'rejected' with rejectionReason", () => {
  it("loan is rejected with the provided reason stored", async () => {
    const { uid: staffUid } = await signInAs("Staff");
    const loan = await applyForLoan(staffUid, "Bob", 80_000, 8, "holiday", staffUid);

    const { uid: rootUid } = await signInAs("Root Admin");
    await rejectLoan(loan.id, "Insufficient salary to support repayment.", rootUid);

    const persisted = await readDocAsAdmin<StaffLoan>("staff_loans", loan.id);
    expect(persisted?.status).toBe("rejected");
    expect(persisted?.rejectionReason).toBe("Insufficient salary to support repayment.");
  });
});

// ── Test 8 ────────────────────────────────────────────────────────────────────
describe("8 — processLoanDeduction: full instalment available (shortfall = 0)", () => {
  it("deducts exactly monthlyInstalment; balance reduces; shortfall is 0", async () => {
    const { loanId, rootUid, monthlyInstalment } = await createActiveLoan(120_000, 12);
    // monthlyInstalment = 10,000

    const result = await processLoanDeduction(loanId, "payroll-run-1", 50_000, rootUid);

    expect(result.amountDeducted).toBe(monthlyInstalment);
    expect(result.shortfall).toBe(0);
    expect(result.isCompleted).toBe(false);

    const persisted = await readDocAsAdmin<StaffLoan>("staff_loans", loanId);
    expect(persisted?.balance).toBe(120_000 - monthlyInstalment);
    expect(persisted?.amountRepaid).toBe(monthlyInstalment);
    expect(persisted?.carryover).toBe(0);
    expect(persisted?.status).toBe("active");

    const repayments = await queryAsAdmin<StaffLoanRepayment>("staff_loan_repayments", "loanId", loanId);
    expect(repayments).toHaveLength(1);
    expect(repayments[0]!.amountDue).toBe(monthlyInstalment);
    expect(repayments[0]!.amountDeducted).toBe(monthlyInstalment);
    expect(repayments[0]!.shortfall).toBe(0);
  });
});

// ── Test 9 ────────────────────────────────────────────────────────────────────
describe("9 — processLoanDeduction: partial (netSalary < monthlyInstalment)", () => {
  it("deducts only what is available; shortfall and carryover are set correctly", async () => {
    const { loanId, rootUid, monthlyInstalment } = await createActiveLoan(120_000, 12);
    // monthlyInstalment = 10,000; salary = 3,000

    const result = await processLoanDeduction(loanId, "payroll-run-1", 3_000, rootUid);

    expect(result.amountDeducted).toBe(3_000);
    expect(result.shortfall).toBe(monthlyInstalment - 3_000); // 7,000
    expect(result.isCompleted).toBe(false);

    const persisted = await readDocAsAdmin<StaffLoan>("staff_loans", loanId);
    expect(persisted?.balance).toBe(120_000 - 3_000);     // 117,000
    expect(persisted?.amountRepaid).toBe(3_000);
    expect(persisted?.carryover).toBe(monthlyInstalment - 3_000); // 7,000
    expect(persisted?.status).toBe("active");
  });
});

// ── Test 10 ───────────────────────────────────────────────────────────────────
describe("10 — processLoanDeduction: carryover from previous month added to amountDue", () => {
  it("second deduction's amountDue = monthlyInstalment + previous shortfall", async () => {
    const { loanId, rootUid, monthlyInstalment } = await createActiveLoan(120_000, 12);
    // monthlyInstalment = 10,000

    // First deduction: partial payment leaves 7,000 carryover
    await processLoanDeduction(loanId, "payroll-run-1", 3_000, rootUid);

    // Second deduction: amountDue should be 10,000 + 7,000 = 17,000
    const result2 = await processLoanDeduction(loanId, "payroll-run-2", 20_000, rootUid);

    expect(result2.amountDeducted).toBe(monthlyInstalment + 7_000); // 17,000
    expect(result2.shortfall).toBe(0);

    // Verify via repayment records
    const repayments = await queryAsAdmin<StaffLoanRepayment>(
      "staff_loan_repayments", "loanId", loanId
    );
    expect(repayments).toHaveLength(2);
    const second = repayments.find((r) => r.amountDue === monthlyInstalment + 7_000);
    expect(second).toBeDefined();
    expect(second!.amountDeducted).toBe(monthlyInstalment + 7_000);
  });
});

// ── Test 11 ───────────────────────────────────────────────────────────────────
describe("11 — loan reaches zero balance → status automatically set to 'completed'", () => {
  it("processLoanDeduction returns isCompleted=true; loan status is 'completed'", async () => {
    const { uid: staffUid } = await signInAs("Staff");
    const loan = await applyForLoan(staffUid, "Charlie", 40_000, 4, "rent", staffUid);
    const { uid: rootUid } = await signInAs("Root Admin");
    await approveLoan(loan.id, rootUid);
    await disburseLoan(loan.id, rootUid);
    // monthlyInstalment = 10,000

    // Seed the loan to be almost fully repaid: balance = 10,000 (one instalment left)
    // by calling processLoanDeduction 3 times
    await processLoanDeduction(loan.id, "run-1", 50_000, rootUid);
    await processLoanDeduction(loan.id, "run-2", 50_000, rootUid);
    await processLoanDeduction(loan.id, "run-3", 50_000, rootUid);

    // Final deduction clears the balance
    const result = await processLoanDeduction(loan.id, "run-4", 50_000, rootUid);
    expect(result.isCompleted).toBe(true);

    const persisted = await readDocAsAdmin<StaffLoan>("staff_loans", loan.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?.balance).toBe(0);
    expect(persisted?.completedAt).toBeDefined();
  });
});

// ── Test 12 ───────────────────────────────────────────────────────────────────
describe("12 — earlyRepayment: clears balance, status 'completed', posts DR 1010 / CR 1250", () => {
  it("balance is 0, status is completed, and early-repayment journal entry is correct", async () => {
    const { loanId, rootUid } = await createActiveLoan(50_000, 5);
    // balance = 50,000 at this point (no deductions yet)

    const updated = await earlyRepayment(loanId, rootUid);
    expect(updated.balance).toBe(0);
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBeDefined();

    const persisted = await readDocAsAdmin<StaffLoan>("staff_loans", loanId);
    expect(persisted?.balance).toBe(0);
    expect(persisted?.status).toBe("completed");

    // Repayment record
    const repayments = await queryAsAdmin<StaffLoanRepayment>(
      "staff_loan_repayments", "loanId", loanId
    );
    const earlyRep = repayments.find((r) => r.type === "early_repayment");
    expect(earlyRep).toBeDefined();
    expect(earlyRep!.amountDeducted).toBe(50_000);
    expect(earlyRep!.shortfall).toBe(0);

    // Journal entries: one for disbursement (DR 1250), one for early repayment (DR 1010)
    type JE = {
      referenceType: string;
      lineItems: Array<{ accountCode: string; debit: number; credit: number }>;
    };
    const jes = await queryAsAdmin<JE>("journal_entries", "referenceId", loanId);
    const earlyJE = jes.find((j) => j.referenceType === "loan_repayment");
    expect(earlyJE).toBeDefined();
    const items = earlyJE!.lineItems;
    const dr1010 = items.find((l) => l.accountCode === "1010" && l.debit > 0);
    const cr1250 = items.find((l) => l.accountCode === "1250" && l.credit > 0);
    expect(dr1010).toBeDefined();
    expect(cr1250).toBeDefined();
    expect(dr1010!.debit).toBe(50_000);
    expect(cr1250!.credit).toBe(50_000);
  });
});

// ── Test 13 ───────────────────────────────────────────────────────────────────
describe("13 — Firestore rules: staff can read own loan, cannot read another staff's loan", () => {
  it("own loan is readable; another employee's loan throws permission-denied", async () => {
    // Create user A with a loan
    const { uid: uidA } = await signInAs("Staff");
    const loan = await applyForLoan(uidA, "User A", 60_000, 6, "reason", uidA);

    // Sign in as a different staff user B
    await signInAs("Staff"); // signs in as B, previous auth is replaced

    // B trying to read A's loan doc should be denied
    // Note: emulator returns "evaluation error" instead of "permission-denied"
    // in the raw SDK path; both indicate rule denial.
    await expect(
      getDoc(doc(db, "staff_loans", loan.id))
    ).rejects.toThrow(/permission|evaluation error/i);
  });

  it("employee can read their own loan document", async () => {
    const { uid } = await signInAs("Staff");
    const loan = await applyForLoan(uid, "Self", 40_000, 4, "reason", uid);
    // Still signed in as same user — read should succeed
    const snap = await getDoc(doc(db, "staff_loans", loan.id));
    expect(snap.exists()).toBe(true);
    expect((snap.data() as StaffLoan).employeeUid).toBe(uid);
  });
});

// ── Test 14 ───────────────────────────────────────────────────────────────────
describe("14 — Firestore rules: HR can read all loans but cannot update (approve/disburse)", () => {
  it("HR can read any loan; update attempt throws permission-denied", async () => {
    // Seed a loan doc bypassing rules so we have something to read
    await seedDoc("staff_loans", "loan-hr-test", {
      employeeUid: "some-other-uid", employeeName: "Other",
      amount: 100_000, amountRepaid: 0, balance: 100_000,
      status: "pending", repaymentMonths: 12,
      monthlyInstalment: 8334, carryover: 0,
      reason: "test", applicationDate: "2026-01-01",
    });

    await signInAs("HR");

    // HR can read any loan (including one not belonging to them)
    const snap = await getDoc(doc(db, "staff_loans", "loan-hr-test"));
    expect(snap.exists()).toBe(true);

    // HR cannot update (approve/disburse operations require CEO or Root Admin)
    await expect(
      updateDoc(doc(db, "staff_loans", "loan-hr-test"), { status: "approved" })
    ).rejects.toThrow(/permission/i);
  });
});
