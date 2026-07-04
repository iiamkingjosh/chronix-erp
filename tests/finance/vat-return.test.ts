import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs } from "../helpers/emulator";
import { createJournalEntry, voidJournalEntry } from "@/lib/accounting/journal-entries";
import { generateVATReturn } from "@/lib/accounting/vat-return";

const MONTH  = "2024-07";
const IN_MO  = "2024-07-15";

beforeAll(async () => { await connectEmulators(); });
beforeEach(async () => { await clearAll(); });
afterAll(async ()  => { await teardownEmulators(); });

describe("generateVATReturn — account-code classification (Fix 3 regression guard)", () => {
  it("classifies output VAT by 4xxx account code, not description keywords", async () => {
    const { uid } = await signInAs("CFO");

    // Hardware payment (4030) — description deliberately contains no hardware keywords.
    // Old keyword matching would have put this in 'other'; new code reads account 4030.
    await createJournalEntry({
      entryDate: IN_MO, description: "Payment INV-001 — Acme Client",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                    debit: 107_500, credit: 0       },
        { accountCode: "4030", accountName: "Hardware Sales Revenue",  debit: 0,       credit: 100_000 },
        { accountCode: "2100", accountName: "VAT Payable",             debit: 0,       credit: 7_500   },
      ],
      status: "posted", createdBy: uid,
    });

    // IT consulting payment (4010) — no consulting keywords in description
    await createJournalEntry({
      entryDate: IN_MO, description: "Payment INV-002 — Beta Corp",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                    debit: 53_750, credit: 0      },
        { accountCode: "4010", accountName: "IT Consulting Revenue",   debit: 0,      credit: 50_000 },
        { accountCode: "2100", accountName: "VAT Payable",             debit: 0,      credit: 3_750  },
      ],
      status: "posted", createdBy: uid,
    });

    // Branding payment (4040) — no brand/design keywords in description
    await createJournalEntry({
      entryDate: IN_MO, description: "Payment INV-003 — Gamma Ltd",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",            debit: 21_500, credit: 0      },
        { accountCode: "4040", accountName: "Branding Revenue", debit: 0,      credit: 20_000 },
        { accountCode: "2100", accountName: "VAT Payable",      debit: 0,      credit: 1_500  },
      ],
      status: "posted", createdBy: uid,
    });

    const r = await generateVATReturn(MONTH, uid);

    expect(r.vatCollected.total).toBeCloseTo(12_750, 2);
    // These assertions would fail if the code reverted to keyword matching —
    // all three descriptions have no revenue-type keywords, so old code put
    // everything in 'other'. New code uses account codes.
    expect(r.vatCollected.hardwareSales).toBeCloseTo(7_500, 2);  // 4030
    expect(r.vatCollected.itServices).toBeCloseTo(3_750, 2);     // 4010
    expect(r.vatCollected.branding).toBeCloseTo(1_500, 2);       // 4040
    expect(r.vatCollected.other).toBe(0);
  });

  it("voided entry's VAT does not appear in the return", async () => {
    const { uid } = await signInAs("CFO");

    // Real payment — should appear
    await createJournalEntry({
      entryDate: IN_MO, description: "Payment INV-010 — Real Corp",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                  debit: 53_750, credit: 0      },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0,      credit: 50_000 },
        { accountCode: "2100", accountName: "VAT Payable",           debit: 0,      credit: 3_750  },
      ],
      status: "posted", createdBy: uid,
    });

    // Create-then-void — this pair's VAT must net to zero
    const toVoid = await createJournalEntry({
      entryDate: IN_MO, description: "Payment INV-011 — Errored Corp",
      referenceType: "payment",
      lineItems: [
        { accountCode: "1010", accountName: "Cash",                  debit: 53_750, credit: 0      },
        { accountCode: "4010", accountName: "IT Consulting Revenue", debit: 0,      credit: 50_000 },
        { accountCode: "2100", accountName: "VAT Payable",           debit: 0,      credit: 3_750  },
      ],
      status: "posted", createdBy: uid,
    });
    await voidJournalEntry(toVoid.id, "Duplicate entry", uid);

    const r = await generateVATReturn(MONTH, uid);

    // Only the real payment's VAT — the void pair (original void-status + reversal) is excluded
    expect(r.vatCollected.itServices).toBeCloseTo(3_750, 2);
    expect(r.vatCollected.total).toBeCloseTo(3_750, 2);
  });

  it("classifies input VAT by cost account code (5xxx → purchases)", async () => {
    const { uid } = await signInAs("CFO");

    // PO with input VAT — 5010 COGS should → purchases bucket
    await createJournalEntry({
      entryDate: IN_MO, description: "PO-001 — Vendor Corp",
      referenceType: "manual",
      lineItems: [
        { accountCode: "5010", accountName: "Cost of Hardware Sold", debit: 40_000, credit: 0      },
        { accountCode: "1110", accountName: "VAT Recoverable",       debit: 3_000,  credit: 0      },
        { accountCode: "1010", accountName: "Cash",                  debit: 0,      credit: 43_000 },
      ],
      status: "posted", createdBy: uid,
    });

    const r = await generateVATReturn(MONTH, uid);

    expect(r.vatPaid.purchases).toBeCloseTo(3_000, 2);
    expect(r.vatPaid.operatingExpenses).toBe(0);
    expect(r.vatPaid.total).toBeCloseTo(3_000, 2);
  });
});
