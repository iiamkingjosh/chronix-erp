import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs } from "../helpers/emulator";
import { makeInvoice } from "../helpers/fixtures";
import { createInvoice } from "@/lib/finance-service";
import { generateVATReturn } from "@/lib/accounting/vat-return";

const VAT_RATE = 0.075;

/** Exact formula at finance/page.tsx:73 and finance/reports/page.tsx:90 */
function revenueFormulaA(i: { subtotal?: number; total: number }): number {
  return i.subtotal ?? i.total;
}

/** Exact formula at tax/corporate/page.tsx:56 */
function revenueFormulaB(i: { subtotal?: number; total: number }): number {
  return i.subtotal != null ? Number(i.subtotal) : Number(i.total) / 1.075;
}

/** Exact formula at tax/page.tsx:101 (dashboard) */
function revenueFormulaC(i: { subtotal?: number; total: number }): number {
  return Number(i.total) || 0;
}

describe("Invariant #3 — \"revenue\" must be the same number on every screen", () => {
  it("DEVIATION D4: the dashboard's formula (C) disagrees with the Finance/P&L formulas (A/B) by exactly the VAT amount, even when subtotal IS present", () => {
    const invoice = { subtotal: 100_000, total: 107_500 }; // 7.5% VAT baked in
    const a = revenueFormulaA(invoice);
    const b = revenueFormulaB(invoice);
    const c = revenueFormulaC(invoice);

    expect(a).toBe(100_000);
    expect(b).toBe(100_000);
    // EXPECTED under invariant #3: c should equal a and b. ACTUAL: it doesn't —
    // the tax dashboard counts VAT as revenue, the Finance dashboard and P&L don't.
    expect(c).toBe(107_500);
    expect(c).not.toBe(a);
  });

  it("DEVIATION D4 (worse case): for a legacy invoice with no `subtotal` field at all, formulas A and B disagree WITH EACH OTHER too", () => {
    const legacyInvoice = { total: 107_500 }; // no subtotal field — pre-dates that schema addition
    const a = revenueFormulaA(legacyInvoice);
    const b = revenueFormulaB(legacyInvoice);
    const c = revenueFormulaC(legacyInvoice);

    // A falls back to the VAT-inclusive total...
    expect(a).toBe(107_500);
    // ...while B falls back to stripping VAT out of the total...
    expect(b).toBeCloseTo(100_000, 2);
    // ...and C is VAT-inclusive like A.
    expect(c).toBe(107_500);

    // So for the exact same legacy invoice, three screens produce two
    // different numbers, and which screen agrees with which depends
    // entirely on whether `subtotal` happens to be set — not on any
    // deliberate business rule.
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });
});

describe("Invariant #4 — the filed VAT return must reconcile with what's shown elsewhere as \"VAT collected\"", () => {
  beforeAll(async () => {
    await connectEmulators();
  });
  beforeEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await teardownEmulators();
  });

  it("DEVIATION D7: an unpaid invoice's VAT is already counted by the ledger-derived return, but excluded by the page-level \"paid only\" estimate", async () => {
    const { uid } = await signInAs("CFO");
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Invoice is created but deliberately left "pending" (never marked paid).
    const invoice = await createInvoice(
      makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500, status: "pending" })
    );
    expect(invoice.status).toBe("pending");

    // The canonical, ledger-derived figure (accounting/vat-return.ts) —
    // this is what actually gets filed with FIRS via saveVATReturn().
    const filedReturn = await generateVATReturn(month, uid);
    expect(filedReturn.vatCollected.total).toBeCloseTo(7_500, 2);

    // The page-level estimate used on tax/vat/page.tsx and the tax
    // dashboard (tax/page.tsx) — both filter `status === "paid"` first.
    const pageEstimate = [invoice]
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + (i.vatAmount != null ? Number(i.vatAmount) : Number(i.total) * VAT_RATE), 0);

    // EXPECTED under invariant #4: these should be the same number, since
    // they're both supposedly describing "VAT collected this month."
    // ACTUAL: the journal entry (and therefore the filed return) recognizes
    // the VAT at invoice-creation time regardless of payment status; the
    // dashboard estimate recognizes it only once paid. A CFO looking at the
    // VAT dashboard right now sees ₦0 for a return that will actually file ₦7,500.
    expect(pageEstimate).toBe(0);
    expect(filedReturn.vatCollected.total).not.toBe(pageEstimate);
  });
});
