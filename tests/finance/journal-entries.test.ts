import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, queryAsAdmin } from "../helpers/emulator";
import { createJournalEntry } from "@/lib/accounting/journal-entries";
import * as autoJournal from "@/lib/accounting/auto-journal";
import { createWHTJournalEntry } from "@/lib/accounting/auto-journal";
import { generateWHTId } from "@/types/tax";
import type { WHTRecord } from "@/types/tax";
import type { JournalEntry } from "@/types/finance";

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

describe("FIXED: DEVIATION D8 — createWHTJournalEntry() is now a canonical, shared helper, matching every other transaction type", () => {
  it("auto-journal.ts now exports createWHTJournalEntry alongside every other transaction type's helper", () => {
    expect(typeof autoJournal.createInvoiceJournalEntry).toBe("function");
    expect(typeof autoJournal.createCashBasisPaymentJournalEntry).toBe("function");
    expect(typeof autoJournal.createExpenseJournalEntry).toBe("function");
    expect(typeof autoJournal.createPayrollJournalEntry).toBe("function");
    expect(typeof autoJournal.createPOJournalEntry).toBe("function");
    expect(typeof autoJournal.createWHTJournalEntry).toBe("function");
  });

  it("produces an identical, balanced journal entry whether called the way finance/invoices/[id]/page.tsx does (with an invoiceNumber) or the way tax/wht/page.tsx does (without one)", async () => {
    const { uid } = await signInAs("CFO");
    const record: WHTRecord = {
      id: "wht-test-1", whtId: generateWHTId(), vendorName: "Acme Vendor",
      invoiceAmount: 100_000, whtRate: 5, whtAmount: 5_000,
      category: "contractor", status: "paid", billDate: "2026-06-10",
      paymentDate: "2026-06-15", certStatus: "pending",
      createdAt: new Date().toISOString(), createdBy: uid,
    };

    const fromInvoicePage = await createWHTJournalEntry({ ...record, id: "wht-test-1" }, uid, { invoiceNumber: "CT260615-001" });
    const fromWhtPage      = await createWHTJournalEntry({ ...record, id: "wht-test-2" }, uid);

    // Same 3-line shape, same amounts, same balance — only the description differs.
    expect(fromInvoicePage.lineItems).toHaveLength(3);
    expect(fromWhtPage.lineItems).toHaveLength(3);
    expect(fromInvoicePage.totalDebit).toBe(fromWhtPage.totalDebit);
    expect(fromInvoicePage.totalCredit).toBe(fromWhtPage.totalCredit);
    expect(fromInvoicePage.lineItems.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit })))
      .toEqual(fromWhtPage.lineItems.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit })));

    expect(fromInvoicePage.description).toContain("CT260615-001");
    expect(fromWhtPage.description).not.toContain("CT260615-001");

    const entries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", "wht-test-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("posted");
  });

  it("DEVIATION FIX — debits the bill's expense account (from record.category), never account 2010 (Accounts Payable), since nothing ever credits 2010 to establish that liability first", async () => {
    const { uid } = await signInAs("CFO");
    const record: WHTRecord = {
      id: "wht-test-3", whtId: generateWHTId(), vendorName: "Acme Vendor",
      invoiceAmount: 200_000, whtRate: 5, whtAmount: 10_000,
      category: "contractor", status: "paid", billDate: "2026-06-10",
      paymentDate: "2026-06-15", certStatus: "pending",
      createdAt: new Date().toISOString(), createdBy: uid,
    };

    const entry = await createWHTJournalEntry(record, uid);
    const debitLine = entry.lineItems.find((l) => l.debit > 0);

    expect(debitLine?.accountCode).toBe("6070"); // Professional Fees — the "contractor" category account
    expect(debitLine?.accountCode).not.toBe("2010");
    expect(debitLine?.debit).toBe(200_000);
    expect(entry.lineItems.some((l) => l.accountCode === "2010")).toBe(false);
  });

  it("DEVIATION FIX — throws rather than posting an entry for a bill with no paymentDate (i.e. still 'pending', never marked paid)", async () => {
    const { uid } = await signInAs("CFO");
    const record: WHTRecord = {
      id: "wht-test-4", whtId: generateWHTId(), vendorName: "Acme Vendor",
      invoiceAmount: 50_000, whtRate: 5, whtAmount: 2_500,
      category: "software", status: "pending", billDate: "2026-06-10",
      certStatus: "pending",
      createdAt: new Date().toISOString(), createdBy: uid,
    };

    await expect(createWHTJournalEntry(record, uid)).rejects.toThrow(/no paymentDate/);
  });
});
