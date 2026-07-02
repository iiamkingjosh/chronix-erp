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
  it("createInvoice (as CFO) posts exactly one balanced journal entry referencing the invoice", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));

    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].totalDebit).toBeCloseTo(107_500, 2);
    expect(entries[0].totalCredit).toBeCloseTo(107_500, 2);

    const persisted = await readDocAsAdmin<Invoice & { _journalPosted?: boolean }>("invoices", invoice.id);
    expect(persisted?._journalPosted).toBe(true);
  });

  it("createPayment (as CFO) posts exactly one journal entry and marks the invoice paid", async () => {
    await signInAs("CFO");
    const invoiceData = makeInvoice({ subtotal: 50_000, vatAmount: 3_750, total: 53_750 });
    const invoice = await createInvoice(invoiceData);

    const payment = await createPayment(makePayment({ ...invoice, id: invoice.id } as Invoice));
    const paymentEntries = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", payment.id);
    expect(paymentEntries).toHaveLength(1);

    const persistedInvoice = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persistedInvoice?.status).toBe("paid");
  });
});

describe("FIXED (D11 — renumbered; originally mislabeled D9, which was already taken by markInvoiceSent's bypass finding) — Sales Rep invoice creation now correctly flags its own journal status", () => {
  it("Sales Rep creates an invoice; the journal entry posts AND _journalPosted is now correctly set on their own invoice", async () => {
    const { uid } = await signInAs("Sales Rep");
    const invoice = await createInvoice(makeInvoice({ subtotal: 80_000, vatAmount: 6_000, total: 86_000, createdBy: uid }));

    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(1);

    const persisted = await readDocAsAdmin<Invoice & { _journalPosted?: boolean; _journalError?: string | null }>(
      "invoices",
      invoice.id
    );
    // EXPECTED and now ACTUAL: the creator-scoped rule lets Sales Rep write
    // these two fields on their own invoice, so the flag is no longer lost.
    expect(persisted?._journalPosted).toBe(true);
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

describe("FIXED: reopening a paid invoice — now blocked when real payments exist, and correctly voids the journal entry when it's safe to reopen", () => {
  it("an invoice marked paid manually (handleMarkPaid — no real payment, amountPaid stays 0) CAN be reopened, and its journal entry is voided", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 60_000, vatAmount: 4_500, total: 64_500 }));
    await updateInvoiceStatus(invoice.id, "paid"); // manual flip — no createPayment(), so amountPaid is still unset

    const entriesBefore = await getJournalEntriesByReference(invoice.id);
    expect(entriesBefore[0].status).toBe("posted");

    await reopenInvoice(invoice.id, "test-cfo-uid");

    const persisted = await readDocAsAdmin<Invoice & { _journalVoidError?: string | null }>("invoices", invoice.id);
    expect(persisted?.status).toBe("pending");
    expect(persisted?._journalVoidError ?? null).toBeNull();

    const entriesAfter = await getJournalEntriesByReference(invoice.id);
    const original = entriesAfter.find((e) => e.id === entriesBefore[0].id);
    expect(original?.status).toBe("void"); // the original invoice-creation entry is now voided

    const reversalCandidates = await getJournalEntriesByReference(entriesBefore[0].id);
    const reversal = reversalCandidates.find((e) => e.status === "posted");
    expect(reversal).toBeDefined(); // and a reversing entry was posted
  });

  it("an invoice with a REAL payment recorded (amountPaid > 0) is genuinely rejected, not silently reopened", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 60_000, vatAmount: 4_500, total: 64_500 }));
    await createPayment(makePayment(invoice as Invoice)); // a real payment — invoice.status becomes "paid" with amountPaid > 0

    const entriesBefore = await getJournalEntriesByReference(invoice.id);

    await expect(reopenInvoice(invoice.id, "test-cfo-uid")).rejects.toThrow(
      /Cannot reopen an invoice with recorded payments/
    );

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid"); // unchanged — rejection happened before any write

    const entriesAfter = await getJournalEntriesByReference(invoice.id);
    // Nothing was voided — every entry (invoice creation + payment) is still posted.
    for (const entry of entriesAfter) expect(entry.status).toBe("posted");
    expect(entriesAfter).toHaveLength(entriesBefore.length);
  });

  it("calling reopenInvoice twice on the same invoice does not throw on the second call's already-void entry (idempotency guard)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 30_000, vatAmount: 2_250, total: 32_250 }));
    await updateInvoiceStatus(invoice.id, "paid");

    await reopenInvoice(invoice.id, "test-cfo-uid"); // voids the original entry

    // A second reopen call (e.g. a double-click, or status manually flipped
    // back to "paid" and reopened again) must not throw trying to re-void
    // an already-void entry — voidJournalEntry() itself is not idempotent,
    // so the caller (reopenInvoice) must skip non-"posted" entries itself.
    await updateInvoiceStatus(invoice.id, "paid");
    await expect(reopenInvoice(invoice.id, "test-cfo-uid")).resolves.toBeUndefined();
  });
});

describe("Edge case — deleteInvoice has no internal guard, but firestore.rules independently protects paid invoices", () => {
  it("CORRECTED FINDING: deleting a paid invoice is rejected by rules, even though finance-service.deleteInvoice itself never checks status", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 30_000, vatAmount: 2_250, total: 32_250 }));
    await updateInvoiceStatus(invoice.id, "paid");

    // Original hypothesis (from the PRD's reading of finance-service.ts in
    // isolation) was that this would succeed, since the function's own
    // comment ("call only for unpaid invoices after UI/auth checks") is not
    // backed by any in-function check. Running it for real shows that
    // firestore.rules' `canDeleteUnpaidInvoice() && resource.data.status != 'paid'`
    // (rule line 268) independently blocks this for every role, including
    // CFO. The application-level guard is genuinely missing, but it is not
    // exploitable in practice — defense-in-depth via rules covers the gap.
    // Recording this as a corrected finding rather than forcing the
    // originally-assumed (incorrect) deviation to "pass."
    await expect(deleteInvoice(invoice.id, "test-actor")).rejects.toThrow(/permission/i);

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted).not.toBeNull(); // invoice still exists — deletion did not go through
    expect(persisted?.status).toBe("paid");

    const entries = await getJournalEntriesByReference(invoice.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("posted"); // ledger is undisturbed, as it should be
  });

  it("deleting a NOT-yet-paid invoice succeeds (rules correctly allow this case)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    expect(invoice.status).toBe("pending");

    await deleteInvoice(invoice.id, "test-actor");

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted).toBeNull();

    // Its journal entry (posted at creation, independent of payment status)
    // is still orphaned — deleting an invoice never voids/reverses its
    // ledger entry, regardless of payment status. This part of the
    // original finding still holds.
    const orphanedEntries = await getJournalEntriesByReference(invoice.id);
    expect(orphanedEntries).toHaveLength(1);
    expect(orphanedEntries[0].status).toBe("posted");
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
    // Firestore transactions retry on contention, but both payments are for
    // the FULL invoice amount — only one can land without exceeding the
    // total, so exactly one succeeds and one is rejected as an overpayment.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const allPaymentsForInvoice = await queryAsAdmin("payments", "invoiceId", invoice.id);
    expect(allPaymentsForInvoice).toHaveLength(1); // only the successful payment was ever written

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid");
    expect(persisted?.amountPaid).toBeCloseTo(215_000, 2); // not 430,000 — the race is closed
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
    expect(persisted?.amountPaid).toBeCloseTo(215_000, 2); // both contributions correctly accumulated, not lost to a race
    expect(persisted?.status).toBe("paid");

    const entries1 = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", p1.id);
    const entries2 = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", p2.id);
    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(1); // each real payment still gets its own journal entry
  });
});

describe("FIXED (D5) — invariant #6: voiding a journal entry now works for every canManageFinance() role, not just Root Admin", () => {
  it("CFO rejecting an invoice DOES now void its journal entry and post a reversing entry", async () => {
    const { uid } = await signInAs("CFO");
    const invoice = await createInvoice(
      makeInvoice({ subtotal: 40_000, vatAmount: 3_000, total: 43_000, approvalStatus: "pending_approval" })
    );

    const entriesBefore = await getJournalEntriesByReference(invoice.id);
    expect(entriesBefore[0].status).toBe("posted");

    await updateInvoiceApproval(invoice.id, "rejected", "Test CFO", { actorUid: uid, rejectionReason: "wrong client" });

    const persisted = await readDocAsAdmin<Invoice & { _journalVoidError?: string | null }>("invoices", invoice.id);
    expect(persisted?.approvalStatus).toBe("rejected");
    expect(persisted?._journalVoidError ?? null).toBeNull(); // no failure to flag

    const entriesAfter = await getJournalEntriesByReference(invoice.id);
    const original = entriesAfter.find((e) => e.id === entriesBefore[0].id);
    expect(original?.status).toBe("void"); // the original is now voided...

    // The reversal's referenceId points at the ORIGINAL JOURNAL ENTRY's id
    // (voidJournalEntry sets `referenceId: original.id`), not the invoice
    // id — so it has to be looked up separately, not via the same
    // invoice-keyed query used for entriesBefore/entriesAfter above.
    const reversalCandidates = await getJournalEntriesByReference(entriesBefore[0].id);
    const reversal = reversalCandidates.find((e) => e.status === "posted");
    expect(reversal).toBeDefined(); // ...and a reversing entry was posted
    expect(reversal?.totalDebit).toBeCloseTo(entriesBefore[0].totalCredit, 2); // debits/credits swapped
  });

  it("Finance Officer (also canManageFinance(), but not in the UI's narrower canApprove gate) can void too — confirming the rule matches canManageFinance(), not just the two UI-exposed roles", async () => {
    const { uid } = await signInAs("Finance Officer");
    const invoice = await createInvoice(
      makeInvoice({ subtotal: 20_000, vatAmount: 1_500, total: 21_500, approvalStatus: "pending_approval" })
    );
    const entriesBefore = await getJournalEntriesByReference(invoice.id);

    await updateInvoiceApproval(invoice.id, "rejected", "Test Finance Officer", { actorUid: uid });

    const entriesAfter = await getJournalEntriesByReference(invoice.id);
    const original = entriesAfter.find((e) => e.id === entriesBefore[0].id);
    expect(original?.status).toBe("void");
  });

  it("a role outside canManageFinance() (e.g. Sales Rep) still cannot void — confirming the rule isn't a blanket unlock", async () => {
    await signInAs("Sales Rep");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    const entries = await getJournalEntriesByReference(invoice.id);

    await expect(
      voidJournalEntry(entries[0].id, "test", "sales-rep-uid")
    ).rejects.toThrow();
  });

  it("the rule rejects an update outside the exact posted->void transition, even from an authorized role (no blanket unlock)", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 10_000, vatAmount: 750, total: 10_750 }));
    const entries = await getJournalEntriesByReference(invoice.id);

    // Attempt to edit an unrelated field on a posted entry directly — not
    // the void transition the rule was written to allow.
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
      createPayment(makePayment(invoice as Invoice, { amount: 10_000 })) // would total 110,000 > 107,500
    ).rejects.toThrow(/exceeding the invoice total/);

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.amountPaid).toBeCloseTo(100_000, 2); // unchanged — the rejected payment wrote nothing
    expect(persisted?.status).toBe("partially_paid"); // unchanged

    const allPayments = await queryAsAdmin("payments", "invoiceId", invoice.id);
    expect(allPayments).toHaveLength(1); // the overpayment attempt never created a payment doc
  });

  it("a payment within rounding tolerance of the exact remaining balance is accepted as \"paid\", not rejected", async () => {
    await signInAs("CFO");
    const invoice = await createInvoice(makeInvoice({ subtotal: 100_000, vatAmount: 7_500, total: 107_500 }));
    // 0.005 over due to floating-point — within the 0.01 tolerance.
    await expect(createPayment(makePayment(invoice as Invoice, { amount: 107_500.005 }))).resolves.toBeDefined();

    const persisted = await readDocAsAdmin<Invoice>("invoices", invoice.id);
    expect(persisted?.status).toBe("paid");
  });
});
