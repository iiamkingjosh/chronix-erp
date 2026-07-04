import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs } from "../helpers/emulator";
import { createJournalEntry } from "@/lib/accounting/journal-entries";
import { generateBalanceSheet } from "@/lib/accounting/balance-sheet";

const AS_OF    = "2025-06-30";
const IN_RANGE = "2025-03-15";
const AFTER    = "2025-12-31"; // after asOfDate — must be excluded

beforeAll(async () => { await connectEmulators(); });
beforeEach(async () => { await clearAll(); });
afterAll(async ()  => { await teardownEmulators(); });

describe("generateBalanceSheet — direct coverage", () => {
  it("Assets = Liabilities + Equity (balanced flag is true) with correct individual balances", async () => {
    const { uid } = await signInAs("CFO");

    // Revenue receipt: cash comes in, revenue credited
    await createJournalEntry({
      entryDate: IN_RANGE, description: "Payment received",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                 debit: 100_000, credit: 0        },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0,       credit: 100_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // Payroll with PAYE withheld → liability 2300
    await createJournalEntry({
      entryDate: IN_RANGE, description: "Payroll March 2025",
      referenceType: "payroll",
      lineItems: [
        { accountCode: "6010", accountName: "Salaries & Wages", debit: 40_000, credit: 0      },
        { accountCode: "1010", accountName: "Cash",             debit: 0,      credit: 34_000 },
        { accountCode: "2300", accountName: "PAYE Payable",     debit: 0,      credit: 6_000  },
      ],
      status: "posted", createdBy: uid,
    });

    // Payroll with pension/NHF deductions → liability 2400
    await createJournalEntry({
      entryDate: IN_RANGE, description: "Payroll April 2025",
      referenceType: "payroll",
      lineItems: [
        { accountCode: "6010", accountName: "Salaries & Wages",          debit: 20_000, credit: 0      },
        { accountCode: "1010", accountName: "Cash",                      debit: 0,      credit: 18_000 },
        { accountCode: "2400", accountName: "Payroll Deductions Payable", debit: 0,     credit: 2_000  },
      ],
      status: "posted", createdBy: uid,
    });

    const bs = await generateBalanceSheet(AS_OF, uid);

    // Cash: 100k received − 34k − 18k paid out = 48k
    expect(bs.assets.currentAssets.cash).toBe(48_000);
    expect(bs.assets.total).toBe(48_000);

    expect(bs.liabilities.currentLiabilities.payePayable).toBe(6_000);
    expect(bs.liabilities.currentLiabilities.payrollDeductionsPayable).toBe(2_000);
    expect(bs.liabilities.total).toBe(8_000);

    // Current-year profit: 100k revenue − 40k − 20k salaries = 40k
    expect(bs.equity.currentYearProfit).toBe(40_000);
    expect(bs.equity.total).toBe(40_000);

    // Assets (48k) = Liabilities (8k) + Equity (40k)
    expect(bs.totalLiabilitiesAndEquity).toBe(48_000);
    expect(bs.balanced).toBe(true);
  });

  it("entry dated after asOfDate is excluded from all balances", async () => {
    const { uid } = await signInAs("CFO");

    // In-range entry — the one that should count
    await createJournalEntry({
      entryDate: IN_RANGE, description: "In-range payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                 debit: 50_000, credit: 0      },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0,      credit: 50_000 },
      ],
      status: "posted", createdBy: uid,
    });

    // After-date entry — must be invisible to the asOfDate balance sheet
    await createJournalEntry({
      entryDate: AFTER, description: "Future payment",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                 debit: 999_000, credit: 0        },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0,       credit: 999_000 },
      ],
      status: "posted", createdBy: uid,
    });

    const bs = await generateBalanceSheet(AS_OF, uid);

    // Only the 50k in-range entry is visible
    expect(bs.assets.currentAssets.cash).toBe(50_000);
    expect(bs.equity.currentYearProfit).toBe(50_000);
    expect(bs.balanced).toBe(true);
  });

  it("Payroll Deductions Payable (2400) appears in current liabilities", async () => {
    const { uid } = await signInAs("CFO");

    await createJournalEntry({
      entryDate: IN_RANGE, description: "Payroll with pension deduction",
      referenceType: "payroll",
      lineItems: [
        { accountCode: "6010", accountName: "Salaries & Wages",          debit: 30_000, credit: 0      },
        { accountCode: "1010", accountName: "Cash",                      debit: 0,      credit: 27_000 },
        { accountCode: "2400", accountName: "Payroll Deductions Payable", debit: 0,     credit: 3_000  },
      ],
      status: "posted", createdBy: uid,
    });

    const bs = await generateBalanceSheet(AS_OF, uid);

    expect(bs.liabilities.currentLiabilities.payrollDeductionsPayable).toBe(3_000);
    expect(bs.liabilities.total).toBe(3_000);
    expect(bs.balanced).toBe(true);
  });
});
