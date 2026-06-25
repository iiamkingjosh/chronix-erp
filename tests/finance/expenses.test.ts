import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin } from "../helpers/emulator";
import { makeExpense } from "../helpers/fixtures";
import { createExpense as createExpenseCanonical, updateExpenseStatus } from "@/lib/expense-service";
import { getJournalEntriesByReference } from "@/lib/accounting/journal-entries";
import type { Expense } from "@/types/expense";
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
