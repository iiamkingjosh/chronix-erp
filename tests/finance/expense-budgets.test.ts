import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin } from "../helpers/emulator";
import { setBudget, getBudgetsForYear } from "@/lib/budget-service";
import { budgetDocId } from "@/types/budget";
import type { ExpenseBudget } from "@/types/budget";
import type { AuditLog } from "@/lib/audit-service";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("setBudget() — one annual budget per category, doc-id scheme, audit trail", () => {
  it("creates a new budget with the expected `${year}_${category}` doc id and fields", async () => {
    const { uid } = await signInAs("CFO");
    const budget = await setBudget("travel", 2027, 500_000, uid);

    expect(budget.id).toBe("2027_travel");
    expect(budget.category).toBe("travel");
    expect(budget.year).toBe(2027);
    expect(budget.annualBudgetAmount).toBe(500_000);
    expect(budget.setBy).toBeTruthy();
    expect(budget.lastUpdatedBy).toBe(budget.setBy);

    const persisted = await readDocAsAdmin<ExpenseBudget>("expense_budgets", budgetDocId(2027, "travel"));
    expect(persisted?.annualBudgetAmount).toBe(500_000);
  });

  it("setting a budget twice for the same year/category upserts (one doc, not two) and preserves the original setBy/setAt", async () => {
    const { uid: uid1 } = await signInAs("CFO");
    const first = await setBudget("software", 2027, 200_000, uid1);
    await new Promise((r) => setTimeout(r, 0));
    const { uid: uid2 } = await signInAs("Root Admin");
    const second = await setBudget("software", 2027, 250_000, uid2);

    expect(second.id).toBe(first.id);
    expect(second.annualBudgetAmount).toBe(250_000);
    expect(second.setBy).toBe(first.setBy); // original creator preserved
    expect(second.lastUpdatedBy).not.toBe(first.setBy); // most recent (different) editor

    const all = await getBudgetsForYear(2027);
    expect(all.filter((b) => b.category === "software")).toHaveLength(1); // exactly one doc, not two
  });

  it("logs the old -> new amount on a revision, and just the set amount on first creation", async () => {
    const { uid } = await signInAs("CFO");
    await setBudget("rent", 2027, 1_000_000, uid);
    await setBudget("rent", 2027, 1_200_000, uid);

    // logAuditEvent() inside setBudget() is fire-and-forget (.catch(() =>
    // {}), never awaited) - poll briefly rather than assuming both writes
    // landed by the time the second setBudget() call resolves.
    let logs: AuditLog[] = [];
    for (let i = 0; i < 10 && logs.length < 2; i++) {
      logs = await queryAsAdmin<AuditLog>("audit_logs", "entityId", budgetDocId(2027, "rent"));
      if (logs.length < 2) await new Promise((r) => setTimeout(r, 100));
    }
    expect(logs).toHaveLength(2);

    const creation = logs.find((l) => l.action === "create");
    const revision = logs.find((l) => l.action === "update");
    expect(creation?.details).toContain("1,000,000");
    expect(creation?.details).not.toMatch(/changed from/);
    expect(revision?.details).toContain("1,000,000");
    expect(revision?.details).toContain("1,200,000");
    expect(revision?.details).toMatch(/changed from/);
  });
});

describe("getBudgetsForYear() — scoped to exactly one year", () => {
  it("only returns budgets for the requested year, not other years", async () => {
    const { uid } = await signInAs("CFO");
    await setBudget("travel", 2027, 100_000, uid);
    await setBudget("travel", 2028, 150_000, uid);
    await setBudget("rent", 2027, 900_000, uid);

    const budgets2027 = await getBudgetsForYear(2027);
    expect(budgets2027).toHaveLength(2);
    expect(budgets2027.every((b) => b.year === 2027)).toBe(true);

    const budgets2028 = await getBudgetsForYear(2028);
    expect(budgets2028).toHaveLength(1);
  });
});

describe("FIXED: setBudget() now has a function-level permission gate, matching updateEmployeeSalary()'s precedent", () => {
  it("CFO, Root Admin, and System Admin can all set a budget", async () => {
    for (const role of ["CFO", "Root Admin", "System Admin"] as const) {
      const { uid } = await signInAs(role);
      await expect(setBudget("marketing", 2029, 50_000, uid)).resolves.toBeDefined();
    }
  });

  it("CEO — who CAN manage/approve finance generally — is rejected at the FUNCTION layer, before Firestore is ever touched, with a clear message", async () => {
    const { uid } = await signInAs("CEO");
    await expect(setBudget("marketing", 2027, 50_000, uid)).rejects.toThrow(
      "You do not have permission to set a budget."
    );

    // Confirms it never reached Firestore at all — no doc was written.
    const persisted = await readDocAsAdmin<ExpenseBudget>("expense_budgets", budgetDocId(2027, "marketing"));
    expect(persisted).toBeNull();
  });

  it("Finance Officer — who CAN manage finance generally — is also rejected at the function layer (the narrower set excludes them too)", async () => {
    const { uid } = await signInAs("Finance Officer");
    await expect(setBudget("marketing", 2027, 50_000, uid)).rejects.toThrow(
      "You do not have permission to set a budget."
    );
  });

  it("a forged actorUid pointing at a real CFO's account cannot be used by a different signed-in user to bypass the check — the rule layer still independently verifies request.auth, unchanged from Stage 1", async () => {
    const { uid: cfoUid } = await signInAs("CFO");
    await signInAs("Staff"); // a different signed-in user now

    // The function-level check would actually PASS here (it reads
    // cfoUid's real role, which is CFO) — this is exactly why the rule
    // layer must remain the real security boundary, not the function
    // check alone: the function check is defense-in-depth against
    // accidental misuse from within the app, not a substitute for rules.
    await expect(setBudget("marketing", 2027, 50_000, cfoUid)).rejects.toThrow();
  });
});

describe("firestore.rules — write access narrower than canManageFinance(), read access broader (matches hasViewFinance())", () => {
  it("CEO (excluded from writing) can still READ budgets — read access is broader than write", async () => {
    const { uid } = await signInAs("CFO");
    await setBudget("travel", 2027, 300_000, uid);
    await import("../helpers/emulator").then((m) => m.signOutCurrent());

    await signInAs("CEO");
    await expect(getBudgetsForYear(2027)).resolves.toHaveLength(1);
  });

  it("a role with no finance-view permission at all (Staff) cannot read budgets either", async () => {
    const { uid } = await signInAs("CFO");
    await setBudget("travel", 2027, 300_000, uid);
    await import("../helpers/emulator").then((m) => m.signOutCurrent());

    await signInAs("Staff");
    // The emulator's rejection message for this case is a verbose rule-
    // evaluation trace ("false for 'list' @ L528"), not a plain
    // "permission-denied" string — confirms the read is genuinely denied.
    await expect(getBudgetsForYear(2027)).rejects.toThrow(/false for 'list'/);
  });
});
