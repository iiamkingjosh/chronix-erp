import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  connectEmulators,
  clearAll,
  teardownEmulators,
  signInAs,
  signOutCurrent,
  readDocAsAdmin,
  queryAsAdmin,
} from "../helpers/emulator";
import { makeInvoice, makePayment } from "../helpers/fixtures";
import { createInvoice, createPayment, updateInvoiceStatus, reopenInvoice, deleteInvoice, updateInvoiceApproval } from "@/lib/finance-service";
import { getJournalEntriesByReference, voidJournalEntry } from "@/lib/accounting/journal-entries";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Invoice } from "@/types/finance";
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

describe("Invariant #2 — one financial event produces exactly one journal entry", () => {
  it("createInvoice (cash-basis) posts NO journal entry — revenue is recognised at payment, not at invoicing", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));

    // Under cash-basis, no JE is created when an invoice is issued.
    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(0);

    const persisted = await readDocAsAdmin<Invoice & { _journalPosted?: boolean }>("invoices", invoice.id);
    expect(persisted?._journalPosted).toBeFalsy(); // flag is not set — no JE was attempted
  });

  it("createPayment (as CFO) posts exactly one cash-basis journal entry and marks the invoice paid", async () => {
    await signInAs("CFO");
    const invoiceData = makeInvoice({ subtotal: 50_000, vatAmount: 3_750, total: 53_750 });
    const invoice = await createInvoice(invoiceData);

    const payment = await createPayment(makePayment({ ...invoice, id: invoice.id } as Invoice));
    // Payment JE is keyed to payment.id (referenceId = payment.id), not invoice.id.
    const paymentEntries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", payment.id);
    expect(paymentEntries).toHaveLength(1);

    // Verify it's a DR Cash / CR Revenue / CR VAT entry (cash-basis shape).
    const je = paymentEntries[0];
    expect(je.totalDebit).toBeCloseTo(53_750, 2);
    expect(je.totalCredit).toBeCloseTo(53_750, 2);

    const persistedInvoice = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persistedInvoice?.status).toBe("paid");
  });
});

describe("FIXED under cash-basis (D11 — previously mislabeled D9) — invoice creation no longer posts any JE, eliminating the Sales-Rep rule gap entirely", () => {
  it("Sales Rep creates an invoice; no journal entry is posted (cash-basis — revenue recognised at payment)", async () => {
    const { uid } = await signInAs("Sales Rep");
    const invoice = await createInvoice(makeInvoice({ subtotal: 80_000, vatAmount: 6_000, total: 86_000, createdBy: uid }));

    // Under cash-basis, no JE at invoice creation — D11's rule gap is moot.
    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(0);

    const persisted = await readDocAsAdmin<Invoice & { _journalPosted?: boolean; _journalError?: string | null }>(
      "invoices",
      invoice.id
    );
    expect(persisted?._journalPosted).toBeFalsy();
    expect(persisted?._journalError ?? null).toBeNull();
  });

  it("the creator-scoped clause does NOT let a Sales Rep write these fields on someone ELSE's invoice (not a blanket unlock)", async () => {
    const { uid: ownerUid } = await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750, createdBy: ownerUid }));
    await signOutCurrent();

    await signInAs("Sales Rep"); // a different uid, not the invoice's creator, and not canManageFinance()
    await expect(
      updateDoc(doc(db, "invoices", invoice.id), { _journalPosted: true, _journalError: null })
    ).rejects.toThrow(/permission/i);
  });

  it("the creator-scoped clause does NOT let the creator write any OTHER field on their own invoice (exact two-field allowlist only)", async () => {
    const { uid } = await signInAs("Sales Rep");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750, createdBy: uid }));

    await expect(
      updateDoc(doc(db, "invoices", invoice.id), { status: "paid" })
    ).rejects.toThrow(/permission/i);
  });
});

describe("Reopening a paid invoice", () => {
  it("an invoice with no payment record CAN be reopened (status flipped manually, no real payment, no JE to void)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 60_000, vatAmount: 4_500, total: 64_500 }));
    await updateInvoiceStatus(invoice.id, "paid"); // manual flip — no createPayment(), amountPaid still unset

    // Under cash-basis, no JE was posted at invoice creation.
    const entriesBefore = await getJournalEntriesByReference(invoice.id);
    expect(entriesBefore).toHaveLength(0);

    await reopenInvoice(invoice.id, "test-cfo-uid");

    const persisted = await readDocAsAdmin<Invoice & { _journalVoidError?: string | null }>("invoices", invoice.id);
    expect(persisted?.status).toBe("pending");
    expect(persisted?._journalVoidError ?? null).toBeNull(); // nothing to void → no error
  });

  it("an invoice with a REAL payment recorded (amountPaid > 0) is genuinely rejected, not silently reopened", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 60_000, vatAmount: 4_500, total: 64_500 }));
    await createPayment(makePayment(invoice as Invoice)); // real payment — invoice.status becomes "paid"

    await expect(reopenInvoice(invoice.id, "test-cfo-uid")).rejects.toThrow(
      /Cannot reopen an invoice with recorded payments/
    );

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid"); // unchanged — rejection happened before any write
  });

  it("calling reopenInvoice twice on the same invoice does not throw on the second call (idempotency guard)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 30_000, vatAmount: 2_250, total: 32_250 }));
    await updateInvoiceStatus(invoice.id, "paid");

    await reopenInvoice(invoice.id, "test-cfo-uid");

    await updateInvoiceStatus(invoice.id, "paid");
    await expect(reopenInvoice(invoice.id, "test-cfo-uid")).resolves.toBeUndefined();
  });
});

describe("Edge case — deleteInvoice has no internal guard, but firestore.rules independently protects paid invoices", () => {
  it("CORRECTED FINDING: deleting a paid invoice is rejected by rules, even though finance-service.deleteInvoice itself never checks status", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 30_000, vatAmount: 2_250, total: 32_250 }));
    await updateInvoiceStatus(invoice.id, "paid");

    await expect(deleteInvoice(invoice.id, "test-actor")).rejects.toThrow(/permission/i);

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("paid");

    // Under cash-basis, no JE was posted at invoice creation, and the invoice
    // was marked paid via status flip (no createPayment), so no payment JE either.
    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(0);
  });

  it("deleting a NOT-yet-paid invoice succeeds (rules correctly allow this case)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    expect(invoice.status).toBe("pending");

    await deleteInvoice(invoice.id, "test-actor");

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted).toBeNull();

    // Under cash-basis, no JE was posted at invoice creation — nothing is
    // left in the ledger after deletion.
    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(0);
  });
});

describe("FIXED (D6) — concurrent full-amount payments against the same invoice: the second is now rejected as an overpayment", () => {
  it("two simultaneous createPayment calls for the full invoice total: exactly one succeeds, the other is rejected", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 200_000, vatAmount: 15_000, total: 215_000 }));

    const results = await Promise.allSettled([
      createPayment(makePayment(invoice as Invoice)),
      createPayment(makePayment(invoice as Invoice)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected  = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const allPaymentsForInvoice = await queryAsAdmin("payments", "invoiceId", invoice.id);
    expect(allPaymentsForInvoice).toHaveLength(1);

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid");
    expect(persisted?.amountPaid).toBeCloseTo(215_000, 2);
  });

  it("two simultaneous HALF-amount payments both succeed and correctly sum to \"paid\" (the legitimate concurrent case)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 200_000, vatAmount: 15_000, total: 215_000 }));

    const [p1, p2] = await Promise.all([
      createPayment(makePayment(invoice as Invoice, { amount: 107_500 })),
      createPayment(makePayment(invoice as Invoice, { amount: 107_500 })),
    ]);

    expect(p1.id).not.toBe(p2.id);
    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.amountPaid).toBeCloseTo(215_000, 2);
    expect(persisted?.status).toBe("paid");

    const entries1 = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", p1.id);
    const entries2 = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", p2.id);
    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(1);
  });
});

describe("FIXED (D5) — invariant #6: voiding a journal entry now works for every canManageFinance() role, not just Root Admin", () => {
  it("CFO rejecting an invoice: no JE exists to void (cash-basis — JE only posts at payment), rejection completes cleanly", async () => {
    const { uid } = await signInAs("CFO");
    const invoice = await createInvoice(
      makeInvoice({ subtotal: 40_000, vatAmount: 3_000, total: 43_000, approvalStatus: "pending_approval" })
    );

    // Under cash-basis, no JE at invoice creation.
    const entriesBefore = await getJournalEntriesByReference(invoice.id);
    expect(entriesBefore).toHaveLength(0);

    await updateInvoiceApproval(invoice.id, "rejected", "Test CFO", { actorUid: uid, rejectionReason: "wrong client" });

    const persisted = await readDocAsAdmin<Invoice & { _journalVoidError?: string | null }>("invoices", invoice.id);
    expect(persisted?.approvalStatus).toBe("rejected");
    expect(persisted?._journalVoidError ?? null).toBeNull(); // nothing to void → no void error
  });

  it("Finance Officer (also canManageFinance()) can void a payment journal entry — confirming the rule matches canManageFinance()", async () => {
    const { uid } = await signInAs("Finance Officer");
    const invoice = await createInvoice(
      makeInvoice({ subtotal: 20_000, vatAmount: 1_500, total: 21_500 })
    );
    const payment = await createPayment(makePayment(invoice as Invoice));

    // The cash-basis JE is keyed to the payment (referenceId = payment.id).
    const entries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", payment.id);
    expect(entries).toHaveLength(1);

    await voidJournalEntry(entries[0].id, "test void", uid);

    const afterVoid = await readDocAsAdmin<{ status: string }>("journal_entries", entries[0].id);
    expect(afterVoid?.status).toBe("void");
  });

  it("a role outside canManageFinance() (e.g. Sales Rep) still cannot void — confirming the rule isn't a blanket unlock", async () => {
    // CFO creates the invoice and records the payment to generate a payment JE.
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    const payment = await createPayment(makePayment(invoice as Invoice));
    await signOutCurrent();

    await signInAs("Sales Rep");
    const entries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", payment.id);

    await expect(
      voidJournalEntry(entries[0].id, "test", "sales-rep-uid")
    ).rejects.toThrow();
  });

  it("the rule rejects an update outside the exact posted->void transition, even from an authorized role (no blanket unlock)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    const payment = await createPayment(makePayment(invoice as Invoice));
    const entries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", payment.id);

    await expect(
      updateDoc(doc(db, "journal_entries", entries[0].id), { description: "edited directly" })
    ).rejects.toThrow(/permission/i);
  });
});

describe("FIXED (D6) — invariant #8: a payment can no longer silently overpay/under-settle an invoice", () => {
  it("a partial payment now correctly leaves the invoice \"partially_paid\", not \"paid\"", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));

    await createPayment(makePayment(invoice as Invoice, { amount: 1 }));

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("partially_paid");
    expect(persisted?.amountPaid).toBeCloseTo(1, 2);
  });

  it("a second payment that brings the running total to the invoice total correctly flips status to \"paid\"", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));

    await createPayment(makePayment(invoice as Invoice, { amount: 1 }));
    await createPayment(makePayment(invoice as Invoice, { amount: 107_499 }));

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid");
    expect(persisted?.amountPaid).toBeCloseTo(107_500, 2);
  });

  it("a payment that would push the running total past the invoice total is hard-blocked — nothing is written", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));
    await createPayment(makePayment(invoice as Invoice, { amount: 100_000 }));

    await expect(
      createPayment(makePayment(invoice as Invoice, { amount: 10_000 }))
    ).rejects.toThrow(/exceeding the invoice total/);

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.amountPaid).toBeCloseTo(100_000, 2);
    expect(persisted?.status).toBe("partially_paid");

    const allPayments = await queryAsAdmin("payments", "invoiceId", invoice.id);
    expect(allPayments).toHaveLength(1);
  });

  it("a payment within rounding tolerance of the exact remaining balance is accepted as \"paid\", not rejected", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));
    await expect(createPayment(makePayment(invoice as Invoice, { amount: 107_500.005 }))).resolves.toBeDefined();

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid");
  });
});
