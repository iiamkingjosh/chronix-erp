import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs } from "../helpers/emulator";
import { createJournalEntry, voidJournalEntry } from "@/lib/accounting/journal-entries";
import { generateProfitLoss } from "@/lib/accounting/profit-loss";

const START  = "2024-06-01";
const END    = "2024-06-30";
const IN_MO  = "2024-06-15";
const PREV   = "2024-05-15"; // prior month — must be excluded

beforeAll(async () => { await connectEmulators(); });
beforeEach(async () => { await clearAll(); });
afterAll(async ()  => { await teardownEmulators(); });

describe("generateProfitLoss — direct coverage", () => {
  it("correctly aggregates revenue, COGS, and OpEx from representative journal entries", async () => {
    const { uid } = await signInAs("CFO");

    // Revenue — IT consulting (4010)
    await createJournalEntry({
      entryDate: IN_MO, description: "Consulting payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 100_000, credit: 0 },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0, credit: 100_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // Revenue — hardware sales (4030)
    await createJournalEntry({
      entryDate: IN_MO, description: "Hardware payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 50_000, credit: 0 },
        { accountCode: "4030", accountName: "Hardware Sales Revenue", debit: 0, credit: 50_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // COGS — cost of hardware sold (5010)
    await createJournalEntry({
      entryDate: IN_MO, description: "PO hardware purchase",
      referenceType: "manual",
      lineItems: [
        { accountCode: "5010", accountName: "Cost of Hardware Sold", debit: 30_000, credit: 0 },
        { accountCode: "1010", accountName: "Cash", debit: 0, credit: 30_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // OpEx — rent (6020)
    await createJournalEntry({
      entryDate: IN_MO, description: "Office rent June",
      referenceType: "expense",
      lineItems: [
        { accountCode: "6020", accountName: "Rent", debit: 15_000, credit: 0 },
        { accountCode: "1010", accountName: "Cash", debit: 0, credit: 15_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // Payroll — salaries (6010) with PAYE withheld
    await createJournalEntry({
      entryDate: IN_MO, description: "Payroll June 2024",
      referenceType: "payroll",
      lineItems: [
        { accountCode: "6010", accountName: "Salaries & Wages", debit: 80_000, credit: 0 },
        { accountCode: "1010", accountName: "Cash",             debit: 0, credit: 68_000 },
        { accountCode: "2300", accountName: "PAYE Payable",     debit: 0, credit: 12_000 },
      ],
      status: "posted", createdBy: uid,
    });

    const r = await generateProfitLoss(START, END, uid);

    expect(r.revenue.itConsulting).toBe(100_000);
    expect(r.revenue.hardwareSales).toBe(50_000);
    expect(r.revenue.total).toBe(150_000);

    expect(r.costOfSales.hardwareCost).toBe(30_000);
    expect(r.costOfSales.total).toBe(30_000);

    expect(r.operatingExpenses.salaries).toBe(80_000);
    expect(r.operatingExpenses.rent).toBe(15_000);
    expect(r.operatingExpenses.total).toBe(95_000);

    expect(r.grossProfit).toBe(120_000);  // 150k − 30k
    expect(r.netProfit).toBe(25_000);     // 120k − 95k
  });

  it("void pair (original + reversal) contributes zero to both revenue and expenses", async () => {
    const { uid } = await signInAs("CFO");

    // Real consulting payment that should appear in the report
    await createJournalEntry({
      entryDate: IN_MO, description: "Real consulting payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 100_000, credit: 0 },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0, credit: 100_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // Create and immediately void — this pair should net to zero
    const entry = await createJournalEntry({
      entryDate: IN_MO, description: "Errored entry",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 25_000, credit: 0 },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0, credit: 25_000 },
      ],
      status: "posted", createdBy: uid,
    });
    await voidJournalEntry(entry.id, "Entered in error", uid);

    const r = await generateProfitLoss(START, END, uid);

    // Void pair: +25k (original, void-status) + −25k (reversal, posted) = 0.
    // Only the real 100k entry should contribute.
    expect(r.revenue.itConsulting).toBe(100_000);
    expect(r.revenue.total).toBe(100_000);
    expect(r.netProfit).toBe(100_000); // no expenses seeded in this test
  });

  it("entries outside the requested date range are excluded", async () => {
    const { uid } = await signInAs("CFO");

    // Prior-month entry — must NOT appear in June report
    await createJournalEntry({
      entryDate: PREV, description: "May consulting payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 200_000, credit: 0 },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0, credit: 200_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // In-range entry — the only one that should appear
    await createJournalEntry({
      entryDate: IN_MO, description: "June consulting payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash", debit: 60_000, credit: 0 },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0, credit: 60_000 },
      ],
      status: "posted", createdBy: uid,
    });

    const r = await generateProfitLoss(START, END, uid);

    expect(r.revenue.itConsulting).toBe(60_000);
    expect(r.revenue.total).toBe(60_000);
  });
});
