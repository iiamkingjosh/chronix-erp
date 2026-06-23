import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin } from "../helpers/emulator";
import { makeExpense } from "../helpers/fixtures";
import { createExpense as createExpenseCanonical, updateExpenseStatus } from "@/lib/expense-service";
import { createExpense as createExpenseLegacy, approveExpense as approveExpenseLegacy, rejectExpense as rejectExpenseLegacy } from "@/lib/accounting/expenses";
import { getJournalEntriesByReference } from "@/lib/accounting/journal-entries";
import type { Expense } from "@/types/expense";

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

describe("DEVIATION D3 — the second expense backend (accounting/expenses.ts) enforces no state machine at all", () => {
  it("approveExpense (legacy path) re-approves an already-rejected expense with no guard", async () => {
    await signInAs("CFO");
    const expense = await createExpenseLegacy(makeExpense() as Omit<Expense, "id" | "submittedAt" | "status">, "test-uid");
    await rejectExpenseLegacy(expense.id, "Test CFO", "not valid");

    let persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    expect(persisted?.status).toBe("rejected");

    // EXPECTED under invariant #5: an already-rejected expense should not be
    // silently re-approvable. ACTUAL: approveExpense has no transition guard
    // whatsoever and happily flips status back to "approved".
    await approveExpenseLegacy(expense.id, "Test CFO");
    persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    expect(persisted?.status).toBe("approved");
  });

  it("rejectExpense (legacy path) can reject an expense that is already \"paid\", with no journal reversal", async () => {
    await signInAs("CFO");
    // Build a paid expense via the canonical path first (so it has a real posted journal entry).
    const expense = await createExpenseCanonical(makeExpense({ amount: 10_000 }));
    await updateExpenseStatus(expense.id, "approved", "Test CFO");
    await updateExpenseStatus(expense.id, "paid", "Test CFO");
    const entriesBefore = await getJournalEntriesByReference(expense.id);
    expect(entriesBefore[0].status).toBe("posted");

    // Now the legacy, unguarded path "rejects" it.
    await rejectExpenseLegacy(expense.id, "Test CFO", "duplicate claim");

    const persisted = await readDocAsAdmin<Expense>("expenses", expense.id);
    // EXPECTED: rejecting a paid expense should be impossible, or should
    // trigger a reversal of the posted journal entry. ACTUAL: status flips
    // straight to "rejected" with the original journal entry left fully
    // posted and unreversed — books now show a paid, posted expense that
    // the expense record itself calls "rejected".
    expect(persisted?.status).toBe("rejected");
    const entriesAfter = await getJournalEntriesByReference(expense.id);
    expect(entriesAfter[0].status).toBe("posted");
  });
});
