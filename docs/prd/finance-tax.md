# Finance & Tax — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md) §A.
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

Finance & Tax is the system of record for Chronix Technology Limited's money: it issues invoices, records payments, tracks expenses and purchase-order spend, maintains a double-entry general ledger, and estimates/files the company's statutory tax obligations (VAT, WHT, PAYE, CIT) against Nigerian tax rules. It is the only module in the codebase that maintains a ledger (`journal_entries`) — every other module's financial side-effects (payroll, subscriptions, POs) flow *into* this module rather than maintaining their own books.

### 1.2 Personas / roles (from `roles.ts` + `firestore.rules`)

| Role | What they're meant to do here |
|---|---|
| **CFO** | Full ownership: create/approve invoices, record payments, approve/reject/mark-paid expenses, manage tax rules, file VAT/WHT/PAYE/CIT, reconcile the ledger. |
| **Finance Officer** | Day-to-day invoice/payment/expense operations; view tax; create invoices; cannot manage tax rules. |
| **CEO** | View-only across finance and tax (`view:tax`, `view:reports`), plus `approve:invoices`/`approve:expenses` — an executive approval gate, not an operator. |
| **System Admin** | Full `manage:finance`; mirrors CFO operationally but not the tax-specific permissions. |
| **Sales Rep** | May `create:invoices` (their own deals) and `submit:expenses`; no approval power. |
| **Staff** | May only `submit:expenses` for themselves. |
| **Executive Assistant** | Read-only mirror of CEO's `view:tax`/`view:reports` — briefing only, never an operator. |
| **Client (portal)** | Reads only their own invoices, gated by `userPortalBillingMatches`. |

### 1.3 What "this feature works correctly" means (concrete invariants)

This is the part that matters most for an audit — these are the business rules the system should be enforcing, not "the page loads without throwing":

1. **Double-entry invariant**: every journal entry's line items must sum to debits == credits. (This one *is* enforced — `createJournalEntry` checks balance before writing.)
2. **One financial event → exactly one journal entry.** An invoice marked paid, a payment recorded, an expense marked paid, a WHT record logged, a VAT return filed, and a payroll run completed must each post **exactly one** corresponding journal entry — not zero (silently dropped on failure) and not two (double-posted by two independent code paths).
3. **A single number for "revenue" per period.** Whatever revenue figure the Finance dashboard, the P&L report, the Tax dashboard, and the Corporate Tax page show for the same month/year must be the *same number*, computed the *same way* (VAT-exclusive, from the same source of truth). It is not acceptable for the number a user sees to depend on which page they opened.
4. **The filed VAT return is the source of truth for VAT, not a separate estimate.** Any other page that displays "VAT collected" or "VAT payable" for a period must reconcile to what `generateVATReturn`/`saveVATReturn` would produce from the ledger — it must not independently re-derive VAT from raw invoice/PO fields using a different formula.
5. **An expense cannot become "paid" without first being "approved."** This state machine must be enforced by a single, shared code path — there must not be a second way to flip an expense's status that skips the check.
6. **A void of a journal entry must actually reverse the company's financial position**, and must be available to every role authorized to manage finance (not silently rejected for everyone except Root Admin).
7. **Counters (invoice numbers, expense numbers, journal numbers) must never be consumed except by the creation of a real corresponding record.** A counter increment with no matching document is a data-integrity defect, not a no-op.
8. **A payment cannot mark an invoice "paid" for more than what is actually owed**, and the system should know the difference between a partial payment and a full settlement (today there is no partial-payment concept at all — see Deviation D6).

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms)                 SERVICE / API LAYER                          FIRESTORE / LEDGER                    EXIT
─────────────────                ───────────────────                          ──────────────────                    ────
finance/invoices/new        →    finance-service.createInvoice           →    invoices (create)                →    invoice detail page,
                                       └─ auto-journal.createInvoiceJournalEntry → journal_entries (create)          client portal, PDF (api/invoices/[id]/pdf)

finance/payments            →    finance-service.createPayment           →    payments (create) + invoices (update status=paid)
                                       └─ auto-journal.createPaymentJournalEntry → journal_entries (create)     →    finance dashboards

finance/expenses            →    expense-service.createExpense /         →    expenses (create/update)
                                  updateExpenseStatus                          └─ on "paid": auto-journal.createExpenseJournalEntry → journal_entries
                                                                          →    AP aging report, P&L opex rows

finance/invoices/[id]        →    inline handleWhtSubmit (UI, NOT service) →   withholding_tax (create)
  (WHT capture)                  + inline createJournalEntry call             + journal_entries (create, hand-built)
tax/wht                      →    inline handleCreate (UI, NOT service)   →   withholding_tax (create) — duplicate of the above

tax/vat, tax/page            →    direct getDocs() in the page itself     →   reads invoices/purchase_orders raw   →    "VAT payable" KPI (own formula, NOT from ledger)
finance/reports/vat-return   →    accounting/vat-return.generateVATReturn →    reads journal_entries by account code →   FIRS-format VAT return → vat_returns (on file)
                                  accounting/vat-return.saveVATReturn     →    vat_returns (create) + journal_entries (FIRS remittance, conditional)

finance/reports/profit-loss  →    accounting/profit-loss.generateProfitLoss →  reads journal_entries by account code →   P&L statement (read-only)
finance/reports/balance-sheet→    accounting/balance-sheet.generateBalanceSheet → reads journal_entries (all-time)  →   Balance sheet (read-only)
finance/reports/year-end     →    accounting/year-end.runYearEndClose     →    journal_entries (closing entry)       →   Retained Earnings rolled forward

finance/reports (Reconcile)  →    accounting/backfill.runFullBackfill     →    journal_entries (create, retroactive) + sets _journalPosted on source docs

api/cron/invoices (scheduled)→    server-side, Admin SDK                  →    notifications (create) [reads invoices for overdue]
api/cron/tax (scheduled)     →    server-side, Admin SDK                  →    notifications (create) [reads tax deadlines]
api/invoices/[id]/send       →    server-side, Admin SDK                  →    invoices (update sentAt/sentTo) [emails client]
api/test-invoice-counter     →    server-side, NO AUTH                    →    metadata/invoiceCounter_* (increment x2) — see Deviation D1
```

**Exit points**: invoice/payment/expense detail pages, PDF generation (`api/invoices/[id]/pdf`), the client portal (reads `invoices` filtered by billing match), the Financial Reports page (P&L/AR-aging/AP-aging/revenue-by-client), the Tax dashboard and four tax sub-pages, and outbound email (invoice send, tax/cron reminders).

### 2.2 Mutation paths — and which ones do NOT share the same underlying logic

This is the "duplicated logic" map the brief asked for. ✅ = goes through one shared, canonical function. ⚠️ = a second, independent path exists for the same conceptual operation.

| Conceptual operation | Canonical path | Duplicate / divergent path(s) | Shared? |
|---|---|---|---|
| Create an expense | `expense-service.createExpense` | `accounting/expenses.createExpense` (different signature, no approval-notification side-effect) | ⚠️ **NOT shared** |
| Approve/reject/pay an expense | `expense-service.updateExpenseStatus` (enforces `EXPENSE_TRANSITIONS` state machine) | `accounting/expenses.approveExpense` / `rejectExpense` (no state-machine guard at all) | ⚠️ **NOT shared** |
| Post a WHT journal entry | *(no canonical helper exists — every other transaction type has one in `auto-journal.ts`, WHT does not)* | Hand-written inline in `finance/invoices/[id]/page.tsx` **and** independently hand-written again in `tax/wht/page.tsx` | ⚠️ **NOT shared (and no canonical version exists to share)** |
| Mark an invoice "sent" | `finance-service.markInvoiceSent` | `api/invoices/[id]/send/route.ts` does its own inline `update({sentAt, sentTo})` and is the one actually used by the shipped send flow | ⚠️ **NOT shared (canonical version appears unused)** |
| Compute "VAT collected/paid" for display | `accounting/vat-return.generateVATReturn` (ledger-derived, account-code based) | `tax/vat/page.tsx` and `tax/page.tsx` (dashboard) each re-derive it directly from `invoices`/`purchase_orders` with two *different* formulas from each other | ⚠️ **NOT shared — three independent implementations of the same number** |
| Compute "revenue" for display | *(no canonical function — should be one)* | `finance/page.tsx`, `finance/reports/page.tsx`, `tax/corporate/page.tsx`, `tax/page.tsx` each compute it independently with different `subtotal`/`total` fallback rules | ⚠️ **NOT shared — four independent implementations** |
| Strip VAT out of a total | *(no canonical helper)* | `finance/payments/page.tsx`, `tax/wht/page.tsx`, `finance/invoices/[id]/page.tsx` each do their own inline arithmetic | ⚠️ **NOT shared — three formulas** |
| Post any other transaction's journal entry (invoice, payment, expense, payroll, PO) | `accounting/auto-journal.ts` (`createInvoiceJournalEntry`, `createPaymentJournalEntry`, `createExpenseJournalEntry`, `createPayrollJournalEntry`, `createPOJournalEntry`) — all funnel into `journal-entries.createJournalEntry` | none found | ✅ **Shared** |
| Void a journal entry | `accounting/journal-entries.voidJournalEntry` | none found (single path) — but see Deviation D5 for why it doesn't work for most roles | ✅ Shared, ❌ broken for non-Root roles |
| Generate the next invoice/expense/journal number | `invoiceCounter.getNextInvoiceNumber` / `expense-counter.getNextExpenseNumber` / `journal-entries.getNextJournalNumber` — each transactional | `api/test-invoice-counter` calls the invoice counter directly, outside any invoice-creation flow | ⚠️ **Canonical counter, but called from a debug endpoint with no corresponding invoice** |

---

## PART 3 — DEVIATIONS (explicit — these are bugs against the invariants in §1.3, not "how it works")

> Each deviation names the invariant it breaks (from §1.3) and the exact location.

### D1 — Invariant #7 violated: live, unauthenticated endpoint burns real invoice numbers
**File**: `src/app/api/test-invoice-counter/route.ts:4-11`
No auth check at all; calls `getNextInvoiceNumber()` twice per request. Every hit permanently advances the production invoice-number counter with no invoice ever created to match. This is debug/test scaffolding that shipped to production and is reachable by anyone.

### D2 — Invariant #2 violated: expense-paid journal posting failures are invisible and unrecoverable in the moment
**File**: `src/lib/expense-service.ts:121-122` (and the equivalent in `finance-service.ts:41-42`, `:93-94`)
When `createExpenseJournalEntry`/`createInvoiceJournalEntry`/`createPaymentJournalEntry` throws, the failure is caught, written to a `_journalError` field, and otherwise swallowed (`.catch(() => {})` on the error-recording write itself, and `console.error` on the original failure). The expense/invoice/payment is left in a "successful" state from the user's perspective while the ledger silently has zero entries for it. There is a manual "Reconcile Ledger" backfill button, but nothing tells the operator a reconciliation is needed.

### D3 — Invariant #5 violated: a second expense-approval path exists with no state-machine guard
**File**: `src/lib/accounting/expenses.ts:34-55` (`approveExpense`, `rejectExpense`)
These functions set `status` directly with no check against `EXPENSE_TRANSITIONS` (the guard that `expense-service.updateExpenseStatus` enforces at `expense-service.ts:51-54`), and they fire none of the notification/audit side-effects the canonical path does. If anything in the codebase still calls this module (not confirmed dead — see inventory §A), an expense could skip straight to "approved" from any prior state, or be "rejected" after being paid.

### D4 — Invariant #3 violated: four independent revenue formulas
**Files**: `finance/page.tsx:71`, `finance/reports/page.tsx:90` (both `subtotal ?? total`), `tax/corporate/page.tsx:56` (`subtotal ?? total/1.075`), `tax/page.tsx:100-101` (`total`, no subtotal at all).
Three different mathematical results for "revenue" depending on which screen you're looking at. This directly produces user-visible disagreement between the Finance dashboard, the P&L, and the Tax dashboard for the same month.

### D5 — Invariant #6 violated: journal-entry void is rule-blocked for everyone except Root Admin
**Files**: `firestore.rules:563` (`journal_entries` update: `if false`) vs. `src/lib/accounting/journal-entries.ts:103-144` (`voidJournalEntry` issues an `updateDoc`).
The only reason this doesn't fail for *everyone* is the catch-all rule at `firestore.rules:587-589` granting Root Admin unconditional write. For CFO/Finance Officer/System Admin — the roles whose job this actually is — the void silently fails and is caught only by a `console.error` (`finance-service.ts:139`), leaving the invoice marked "rejected" in the UI while the original (wrong) journal entry remains posted and unreversed.

### D6 — Invariant #8 violated: payments force-mark invoices fully paid regardless of amount
**File**: `src/lib/finance-service.ts:82-104` (`createPayment`)
The batch write sets the invoice's `status` to `"paid"` unconditionally — it does not check the invoice's current status, approval state, or whether the recorded payment amount actually equals the invoice total. There is no partial-payment concept in the type model at all. Any payment record against any invoice (even ₦1 against a ₦1,000,000 invoice) flips that invoice to fully paid.

### D7 — Invariant #4 violated: VAT shown on three different screens reconciles to three different numbers
**Files**: `src/lib/accounting/vat-return.ts:44-65` (ledger/account-code derived, the only one that's actually filed), `tax/vat/page.tsx:63-69` (estimated from invoices/POs directly, `po.total*0.075`), `tax/page.tsx:91-97` (estimated again, `po.vatAmount` instead of `po.total*0.075`).
None of the two dashboard estimates reconcile to the figure that actually gets filed with FIRS. A CFO glancing at the Tax dashboard is not looking at the number that will appear on the VAT return.

### D8 — Invariant #2 violated: WHT has no canonical journal-posting function, and is duplicated by hand twice
**Files**: `finance/invoices/[id]/page.tsx:137-189` and `tax/wht/page.tsx:178-243`.
Both hand-build the identical 3-line WHT journal entry (`2010` debit / `2200` credit / `1010` credit) directly in UI code instead of through `auto-journal.ts`, which has a dedicated function for every other transaction type except this one. Each copy can independently drift from the other; there is currently no single place to fix a WHT-journal bug.

### D9 — Invariant #2 partially violated: `markInvoiceSent` (the documented/intended function) is bypassed by the shipped flow
**Files**: `finance-service.ts:111-116` vs. `api/invoices/[id]/send/route.ts:96`.
Two functions exist to do the same update; the one actually wired into the send button is the inline Admin-SDK version, not the service function. Not currently harmful (both do the same field update) but is exactly the kind of split that drifts silently — see D8 for what happens when it does.

### D10 — Invariant #3/#4 root cause: tax dashboards bypass the service layer entirely
**Files**: `tax/page.tsx`, `tax/vat/page.tsx`, `tax/corporate/page.tsx`, `tax/paye/page.tsx`.
All four call `getDocs(collection(...))` directly on raw collections and re-implement their own revenue/VAT/expense math client-side, rather than calling `finance-service`/`accounting/*` functions. This is the structural reason D4 and D7 exist — there is no enforcement mechanism preventing a fifth page from inventing a sixth formula tomorrow.

### D11 — **FIXED this session.** Invariant #2 violated: Sales-Rep-created invoices had a real journal entry with zero trace of it on the invoice itself
**Files**: `finance-service.ts` (`createInvoice`) vs. `firestore.rules`' `invoices` update rule (was `canManageFinance()`-only).
Discovered during testing, not the original static-reading pass — originally mislabeled "D9" in `finance-tax-test-results.md` before the collision with this document's actual D9 (`markInvoiceSent` bypass, above) was caught. `createInvoiceJournalEntry` succeeded for a Sales-Rep-created invoice (Sales Rep can create `journal_entries`), but the follow-up `_journalPosted`/`_journalError` flag write was rejected (`canManageFinance()` doesn't include Sales Rep) and silently swallowed — a real, correctly-posted journal entry with no trace of it on the invoice document. Fixed by widening the `invoices` update rule with a narrow, creator-scoped clause: whoever created the invoice may write exactly these two fields on their own invoice, regardless of role. See `docs/prd/finance-tax-test-results.md` for the full before/after test evidence.

### D12 — Invariant #7 violated (a second instance, same shape as D1): two active code paths generate invoice numbers outside `getNextInvoiceNumber()`, uncoordinated with the sequential counter
**Files**: `subscriptions/[id]/page.tsx` ("Renew Now" — calls `createInvoice()` but built its own `` `CT${yy}${mm}${dd}-${rand}` `` instead of calling the counter) and `api/cron/subscriptions/route.ts` (bypasses `createInvoice()` entirely via direct Admin-SDK write, with an independently-duplicated copy of the identical random-suffix pattern).
Neither path coordinates with the sequential numbering scheme the rest of the system uses (`invoiceCounter.ts`'s `metadata/invoiceCounter_{prefix}` document) — a counter-issued number and a random-suffix number could theoretically collide, and reconciliation tooling that assumes the canonical `CT{date}-{seq}` format (e.g. `migrate-invoice-numbers.mjs`) won't recognize numbers from either path. Also the root cause that made two real production invoices (`CT260511`, `CT2605111`) look like near-duplicates of each other — though those two specifically predate even this bug, from an older, now fully-retired `generateInvoiceNumber()` function that had no sequencing at all (confirmed dead via `git show` + repo-wide grep, zero references remain). **Fixed this session**: path #2 now calls the existing client-SDK `getNextInvoiceNumber()`; path #3 now calls a new Admin-SDK-compatible `getNextInvoiceNumberAdmin()` (`src/lib/invoiceCounter-admin.ts`) that reads/writes the exact same counter document. Both ad-hoc random-suffix implementations were deleted, not just bypassed.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Is the **PAYE band mismatch** (`types/tax.ts` computed bands vs. `tax/paye/page.tsx` displayed bands — inventory §A) a stale UI that needs updating to match a recent Finance Act change, or is the *calculator* the one that's out of date? This requires a business decision, not just a code fix.
- Is the **CIT tiered-rate vs flat-30%** split (`tax/corporate/page.tsx` vs `tax/page.tsx`/`tax-service.ts`) intentional — i.e., is Chronix actually a small company eligible for the 0%/20% tiers, making the dashboard's flat 30% the wrong one? Needs a decision from whoever owns tax filing, not assumed from code.
