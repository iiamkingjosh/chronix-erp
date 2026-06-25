import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, seedDoc, signOutCurrent } from "../helpers/emulator";
import { getExpenseActualsForYear } from "@/lib/expense-service";
import { setBudget } from "@/lib/budget-service";
import { canSetBudget } from "@/types/roles";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function seedExpense(id: string, overrides: Record<string, unknown>) {
  return seedDoc("expenses", id, {
    title: "Seeded expense",
    amount: 0,
    description: "",
    status: "paid",
    submittedBy: "Seed",
    submittedByUid: "seed-uid",
    submittedAt: new Date().toISOString(),
    ...overrides,
  });
}

describe("getExpenseActualsForYear() — real aggregation, multiple categories/months/types", () => {
  it("sums correctly by category, month, and expenseType across several seeded expenses", async () => {
    await signInAs("CFO");
    await seedExpense("e1", { category: "travel", expenseType: "staff_claim",     amount: 10_000, date: "2027-01-15" });
    await seedExpense("e2", { category: "travel", expenseType: "company_expense", amount: 20_000, date: "2027-01-20" });
    await seedExpense("e3", { category: "travel", expenseType: "staff_claim",     amount: 5_000,  date: "2027-02-05" });
    await seedExpense("e4", { category: "software", expenseType: "company_expense", amount: 50_000, date: "2027-01-10" });
    // Different year — must NOT be counted in 2027's totals.
    await seedExpense("e5", { category: "travel", expenseType: "staff_claim", amount: 999_999, date: "2026-01-15" });
    // Not paid — must NOT be counted (matches the P&L "paid only" convention).
    await seedExpense("e6", { category: "travel", expenseType: "staff_claim", amount: 777_777, date: "2027-01-15", status: "pending" });

    const actuals = await getExpenseActualsForYear(2027);

    const travelJan = actuals.find((a) => a.category === "travel" && a.month === 1);
    expect(travelJan?.total).toBe(30_000);
    expect(travelJan?.staffClaim).toBe(10_000);
    expect(travelJan?.companyExpense).toBe(20_000);

    const travelFeb = actuals.find((a) => a.category === "travel" && a.month === 2);
    expect(travelFeb?.total).toBe(5_000);
    expect(travelFeb?.staffClaim).toBe(5_000);
    expect(travelFeb?.companyExpense).toBe(0);

    const softwareJan = actuals.find((a) => a.category === "software" && a.month === 1);
    expect(softwareJan?.total).toBe(50_000);
    expect(softwareJan?.companyExpense).toBe(50_000);

    // 2026's and the pending expense's amounts must not leak into 2027's totals anywhere.
    const allTotals = actuals.reduce((s, a) => s + a.total, 0);
    expect(allTotals).toBe(30_000 + 5_000 + 50_000);
  });

  it("a category with zero recorded expenses produces no entry at all (the page must default this to ₦0, not error/NaN/undefined)", async () => {
    await signInAs("CFO");
    await seedExpense("e1", { category: "travel", expenseType: "staff_claim", amount: 10_000, date: "2027-01-15" });

    const actuals = await getExpenseActualsForYear(2027);
    const rentEntry = actuals.find((a) => a.category === "rent");
    expect(rentEntry).toBeUndefined();

    // Confirms the page-level fallback pattern (`?? 0`) produces a clean
    // zero rather than propagating undefined/NaN into a formatted figure.
    const total = rentEntry?.total ?? 0;
    expect(total).toBe(0);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("zero expenses recorded anywhere for the whole year returns an empty array cleanly, not an error", async () => {
    await signInAs("CFO");
    const actuals = await getExpenseActualsForYear(2099);
    expect(actuals).toEqual([]);
  });
});

describe("Write access to setBudget() from this UI is genuinely gated, not just hidden", () => {
  it("CEO's role fails canSetBudget() (the same check the page uses to decide whether to render the edit control)", () => {
    expect(canSetBudget("CEO")).toBe(false);
    expect(canSetBudget("CFO")).toBe(true);
  });

  it("a CEO session attempting the underlying setBudget() call directly is genuinely rejected, not silently allowed", async () => {
    const { uid } = await signInAs("CEO");
    await expect(setBudget("travel", 2027, 1_000_000, uid)).rejects.toThrow(
      "You do not have permission to set a budget."
    );
  });

  it("a CEO session CAN still read the aggregated actuals (read-only access, confirming the page would show figures but no working edit control)", async () => {
    const { uid: cfoUid } = await signInAs("CFO");
    await setBudget("travel", 2027, 500_000, cfoUid);
    await seedExpense("e1", { category: "travel", expenseType: "company_expense", amount: 25_000, date: "2027-03-10" });
    await signOutCurrent();

    await signInAs("CEO");
    await expect(getExpenseActualsForYear(2027)).resolves.toHaveLength(1);
  });
});
