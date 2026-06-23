import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs } from "../helpers/emulator";
import { createJournalEntry } from "@/lib/accounting/journal-entries";
import * as autoJournal from "@/lib/accounting/auto-journal";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #1 — double-entry balance is enforced (baseline: this one already holds)", () => {
  it("createJournalEntry rejects an unbalanced entry", async () => {
    await signInAs("CFO");
    await expect(
      createJournalEntry({
        entryDate: new Date().toISOString().split("T")[0],
        description: "Deliberately unbalanced test entry",
        referenceType: "manual",
        lineItems: [
          { accountCode: "1010", accountName: "Cash", debit: 1000, credit: 0 },
          { accountCode: "4010", accountName: "Revenue", debit: 0, credit: 999 }, // off by 1
        ],
        status: "posted",
        createdBy: "test-uid",
      })
    ).rejects.toThrow(/not balanced/);
  });

  it("createJournalEntry accepts a balanced entry", async () => {
    await signInAs("CFO");
    const entry = await createJournalEntry({
      entryDate: new Date().toISOString().split("T")[0],
      description: "Balanced test entry",
      referenceType: "manual",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 1000, credit: 0 },
        { accountCode: "4010", accountName: "Revenue", debit: 0, credit: 1000 },
      ],
      status: "posted",
      createdBy: "test-uid",
    });
    expect(entry.totalDebit).toBe(entry.totalCredit);
  });
});

describe("DEVIATION D8 — there is no canonical, shared journal-posting helper for Withholding Tax", () => {
  it("auto-journal.ts exports a dedicated create*JournalEntry function for every other transaction type except WHT", () => {
    // Every other transaction type that touches the ledger has its own
    // canonical helper here: invoices, payments, expenses, payroll, POs.
    expect(typeof autoJournal.createInvoiceJournalEntry).toBe("function");
    expect(typeof autoJournal.createPaymentJournalEntry).toBe("function");
    expect(typeof autoJournal.createExpenseJournalEntry).toBe("function");
    expect(typeof autoJournal.createPayrollJournalEntry).toBe("function");
    expect(typeof autoJournal.createPOJournalEntry).toBe("function");

    // EXPECTED under invariant #2 (one event -> one journal entry, posted
    // through one shared mechanism): WHT should have an equivalent
    // `createWHTJournalEntry` here too. ACTUAL: no such export exists —
    // both `finance/invoices/[id]/page.tsx` and `tax/wht/page.tsx` instead
    // hand-build the identical 3-line journal entry inline, independently.
    expect((autoJournal as Record<string, unknown>).createWHTJournalEntry).toBeUndefined();
  });
});
