import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin } from "../helpers/emulator";
import { makeExpense } from "../helpers/fixtures";
import { createExpense as createExpenseCanonical, updateExpenseStatus } from "@/lib/expense-service";
import { getJournalEntriesByReference } from "@/lib/accounting/journal-entries";
import type { Expense } from "@/types/expense";
import type { AppNotification } from "@/types/notifications";
import { existsSync } from "node:fs";
import { join } from "node:path";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #5 — an expense cannot become \"paid\" without first being \"approved\" (canonical path)", () => {
  it("updateExpenseStatus rejects an illegal pending -> paid transition", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ status: "pending" }));

    await expect(updateExpenseStatus(expense.id, "paid", "Test CFO")).rejects.toThrow(
      /Cannot change expense from "pending" to "paid"/
    );
  });

  it("updateExpenseStatus(..., \"paid\") on an approved expense posts exactly one journal entry", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ amount: 15_000 }));
    await updateExpenseStatus(expense.id, "approved", "Test CFO");
    await updateExpenseStatus(expense.id, "paid", "Test CFO");

    const entries = await getJournalEntriesByReference(expense.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].totalDebit).toBeCloseTo(15_000, 2);

    const persisted = await readDocAsAdmin<Expense & { _journalPosted?: boolean }>("expenses", expense.id);
    expect(persisted?._journalPosted).toBe(true);
  });
});

describe("FIXED: DEVIATION D3 — the second expense backend (accounting/expenses.ts) enforced no state machine at all", () => {
  it("accounting/expenses.ts is deleted entirely — confirmed dead, zero real callers, superseded by expense-service.ts's already-guarded updateExpenseStatus()", () => {
    expect(existsSync(join(process.cwd(), "src/lib/accounting/expenses.ts"))).toBe(false);
  });

  it("the real, wired path already blocks rejected -> approved", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense());
    await updateExpenseStatus(expense.id, "rejected", "Test CFO", { rejectionReason: "not valid" });

    await expect(updateExpenseStatus(expense.id, "approved", "Test CFO")).rejects.toThrow(
      /Cannot change expense from "rejected" to "approved"/
    );
  });

  it("the real, wired path already blocks rejecting a paid expense, leaving its posted journal entry untouched", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ amount: 10_000 }));
    await updateExpenseStatus(expense.id, "approved", "Test CFO");
    await updateExpenseStatus(expense.id, "paid", "Test CFO");

    await expect(
      updateExpenseStatus(expense.id, "rejected", "Test CFO", { rejectionReason: "duplicate claim" })
    ).rejects.toThrow(/Cannot change expense from "paid" to "rejected"/);

    const persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    expect(persisted?.status).toBe("paid");
    const entries = await getJournalEntriesByReference(expense.id);
    expect(entries[0].status).toBe("posted");
  });
});

describe("New: expenseType (staff_claim vs company_expense) is stored and round-trips correctly", () => {
  it("staff_claim and company_expense both persist exactly as submitted", async () => {
    await signInAs("CFO");
    const claim   = await createExpenseCanonical(makeExpense({ expenseType: "staff_claim" }));
    const company = await createExpenseCanonical(makeExpense({ expenseType: "company_expense" }));

    const persistedClaim   = await readDocAsAdmin<Expense>("expenses", claim.id);
    const persistedCompany = await readDocAsAdmin<Expense>("expenses", company.id);
    expect(persistedClaim?.expenseType).toBe("staff_claim");
    expect(persistedCompany?.expenseType).toBe("company_expense");
  });
});

describe("New: a CFO's own submission is auto-approved — skips the pending step entirely", () => {
  it("a CFO submitting their own expense lands directly in \"approved\", with approvedBy/approvedAt stamped, for both expenseTypes", async () => {
    await signInAs("CFO");
    const claim = await createExpenseCanonical(
      makeExpense({ expenseType: "staff_claim", submittedBy: "Test CFO" }),
      "CFO"
    );
    const company = await createExpenseCanonical(
      makeExpense({ expenseType: "company_expense", submittedBy: "Test CFO" }),
      "CFO"
    );

    expect(claim.status).toBe("approved");
    expect(claim.approvedBy).toBe("Test CFO");
    expect(claim.approvedAt).toBeTruthy();
    expect(company.status).toBe("approved");

    const persisted = await readDocAsAdmin<Expense>("expenses", claim.id);
    expect(persisted?.status).toBe("approved");
  });

  it("no \"expense_submitted\" notification is created for a CFO's auto-approved self-submission — nothing is actually awaiting approval", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ submittedBy: "Test CFO" }), "CFO");

    const notifs = await queryAsAdmin<AppNotification>("notifications", "dedupeKey", `expense-approval-${expense.id}`);
    expect(notifs).toHaveLength(0);
  });

  it("everyone else's submission still requires approval, regardless of expenseType — auto-approval is CFO-self-submission-only, not a blanket rule", async () => {
    const { uid } = await signInAs("Staff");
    const claim = await createExpenseCanonical(
      makeExpense({ expenseType: "staff_claim", submittedByUid: uid }),
      "Staff"
    );
    const company = await createExpenseCanonical(
      makeExpense({ expenseType: "company_expense", submittedByUid: uid }),
      "Staff"
    );

    expect(claim.status).toBe("pending");
    expect(company.status).toBe("pending");

    // createNotification() inside createExpense() is fire-and-forget
    // (.catch(() => {}), never awaited) - same pre-existing pattern as
    // every other notification call in this service. Poll briefly rather
    // than assuming it's written by the time createExpense() resolves.
    let notifs: AppNotification[] = [];
    for (let i = 0; i < 10 && notifs.length === 0; i++) {
      notifs = await queryAsAdmin<AppNotification>("notifications", "dedupeKey", `expense-approval-${claim.id}`);
      if (notifs.length === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(notifs).toHaveLength(1); // a real submission DOES need someone to act on it
  });

  it("a CEO's own submission is NOT auto-approved — the rule is CFO-specific, not 'any approver role'", async () => {
    await signInAs("CEO");
    const expense = await createExpenseCanonical(makeExpense({ submittedBy: "Test CEO" }), "CEO");
    expect(expense.status).toBe("pending");
  });
});

describe("New: D3's state-machine guard is unaffected by auto-approval — it governs transitions FROM \"approved\" identically, regardless of how that status was reached", () => {
  it("an auto-approved (CFO self-submission) expense can still be marked paid, posting exactly one journal entry — same as the manually-approved path", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(
      makeExpense({ amount: 12_000, submittedBy: "Test CFO" }),
      "CFO"
    );
    expect(expense.status).toBe("approved"); // confirms the pending step really was skipped

    await updateExpenseStatus(expense.id, "paid", "Test CFO");

    const entries = await getJournalEntriesByReference(expense.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].totalDebit).toBeCloseTo(12_000, 2);

    const persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    expect(persisted?.status).toBe("paid");
  });

  it("an auto-approved expense, once paid, still cannot be rejected — paid is terminal regardless of how \"approved\" was reached", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ submittedBy: "Test CFO" }), "CFO");
    await updateExpenseStatus(expense.id, "paid", "Test CFO");

    await expect(
      updateExpenseStatus(expense.id, "rejected", "Test CFO", { rejectionReason: "test" })
    ).rejects.toThrow(/Cannot change expense from "paid" to "rejected"/);
  });

  it("an auto-approved expense CAN still be rejected before it's paid — \"approved\" -> \"rejected\" remains valid regardless of how approval was reached", async () => {
    await signInAs("CFO");
    const expense = await createExpenseCanonical(makeExpense({ submittedBy: "Test CFO" }), "CFO");

    await updateExpenseStatus(expense.id, "rejected", "Test CFO", { rejectionReason: "changed my mind" });

    const persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    expect(persisted?.status).toBe("rejected");
  });
});
