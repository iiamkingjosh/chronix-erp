# Finance & Tax — Invariant Test Suite Results

> Detection only. No application code was changed. Run via `npm run test:emulator`
> (spins up the real Firestore + Auth emulators, runs the suite, tears down).
> Tests live under `tests/finance/`, harness under `tests/helpers/`.

## Infrastructure built

- **Vitest** for the runner, **`@firebase/rules-unit-testing@3.0.4`** (pinned to match the project's `firebase@^10` — newer versions require `firebase@^11`) for emulator control.
- Tests run against the **real `firestore.rules`** via the Firestore emulator, signed in through the **real Auth emulator** — every assertion about "does this role actually succeed/fail" is checked against the genuine rules engine, not a mock.
- The emulator needs Java 21+; the system only had Java 17. Rather than touch the system Java install, a portable JDK was downloaded into `.tools/` (gitignored) and is auto-detected by `npm run test:emulator` — fully local, fully reversible, nothing system-wide changed.

## Two harness bugs found and fixed in my own test code before trusting any result

Per your instruction not to change tests to match application bugs — these were not application bugs, they were bugs in the test scaffolding I wrote, caught by symptom (near-universal, suspiciously-uniform failures) and confirmed by reading the actual library source before "fixing":

1. **Fixture bug**: `makeInvoice()` set `approvalStatus: overrides.approvalStatus`, which evaluates to `undefined` when not overridden — and the Firestore client SDK rejects explicit `undefined` field values outright. Fixed to only include optional fields when actually provided.
2. **Helper bug**: `RulesTestContext.firestore()` in this package version returns the **compat (namespaced)** Firestore API, not the modular one — my admin-read/seed helpers were passing that into modular `doc()`/`getDoc()`/`setDoc()`, which is invalid. Separately, I confirmed by reading the package's compiled source that `withSecurityRulesDisabled()` **always resolves to `undefined`**, discarding whatever the callback returns. Both fixed: admin helpers now use the compat API directly and capture results via an outer-scoped variable instead of a return value.

Once both were fixed, results stopped being suspiciously uniform and started reflecting real, varied application behavior — which is what's reported below.

## Results: 20/20 tests pass — read that as "the suite successfully proved what it set out to prove," not "no bugs"

Most of these tests are written so that **passing means a deviation was successfully reproduced with real evidence**. A few are written so that passing means an invariant **does** hold. Both kinds matter; they're labeled below.

### Confirmed deviations (matching the PRD's D-numbers, now with concrete reproduced evidence)

| # | Test | Expected (invariant) | Actual (reproduced) |
|---|---|---|---|
| D3 | `accounting/expenses.ts` legacy backend | An already-rejected expense shouldn't be re-approvable | `approveExpense()` flips status straight from `"rejected"` back to `"approved"` with zero guard |
| D3 | same | A paid expense shouldn't be "rejectable" | `rejectExpense()` flips a `paid`, journal-posted expense to `"rejected"`, leaving the original journal entry `posted` and unreversed |
| D5 | CFO rejects an invoice | Void should succeed for any finance-authorized role | `journal_entries` update rule is `if false` for everyone except the Root-Admin catch-all; CFO's void is rejected by rules and silently swallowed — invoice shows `"rejected"`, ledger still shows the original entry `"posted"` |
| D6 | Partial payment | An invoice shouldn't be markable "paid" by a partial amount | Paying ₦1 of a ₦107,500 invoice flips `status` to `"paid"` immediately |
| D7 | VAT dashboard vs. filed return | The two should reconcile | An unpaid invoice's VAT (₦7,500) is already counted by the ledger-derived `generateVATReturn()` (which posts at invoice *creation*), but excluded by the page-level "paid only" estimate (₦0) — confirmed with real numbers, not just line references |
| D8 | WHT journal posting | A shared `createWHTJournalEntry` helper should exist like every other transaction type | `auto-journal.ts` has no such export — confirmed by direct import check |
| D4 | Revenue formula consistency | One number per period across screens | Same invoice (`subtotal: 100,000`, `total: 107,500`) yields ₦100,000 on Finance/P&L pages, ₦107,500 on the tax dashboard — and for a legacy invoice with no `subtotal` field, the Finance page and the Corporate Tax page disagree **with each other** too (₦107,500 vs ₦100,000) |

### New findings, surfaced only by actually running this (not in the original PRD's deviation list)

- **D11 (new — renumbered from an originally mislabeled "D9"; the PRD's actual D9 is the unrelated `markInvoiceSent` bypass finding)**: A **Sales Rep**-created invoice gets its journal entry posted successfully (Sales Rep is allowed to create `journal_entries`), but the follow-up `_journalPosted`/`_journalError` flag write on the invoice itself is rejected by rules (invoice `update` requires `canManageFinance()`, which Sales Rep lacks) — and *that* rejection is also swallowed. Net effect: every Sales-Rep-created invoice has a real, correctly-posted journal entry that the invoice document itself gives zero indication of — no success flag, no error flag, nothing. The "Journal Not Posted" warning banner in the UI checks for `_journalError`, which never gets set here, so this is invisible even to someone looking for it.
- **Reopening edge case (new)**: marking a paid invoice back to `"pending"` does not touch its journal entry at all — the ledger keeps showing it as fully posted while the invoice itself says otherwise, with nothing linking the reopen event to the ledger.
- **Concurrent-payment edge case (new)**: two simultaneous `createPayment()` calls against the same invoice both succeed in full, independently, each posting its own complete journal entry — there is no idempotency or "already paid" guard at the payment layer (only the unconditional status overwrite from D6).

### A corrected finding — this one is good news, and worth flagging precisely because the original inference was wrong

The PRD's architecture summary inferred that `deleteInvoice()` has no internal guard against deleting a *paid* invoice (true — it doesn't), and concluded this meant a paid invoice could be deleted, orphaning its journal entry. **Running it for real shows that conclusion was wrong**: `firestore.rules`' `canDeleteUnpaidInvoice() && resource.data.status != 'paid'` (rule line 268) independently blocks this for every role, including CFO. The application-level guard really is missing, but it isn't exploitable — defense-in-depth via rules covers the gap completely. (Deleting an invoice that is *not yet paid* does still succeed and does still orphan its journal entry with no cleanup — that narrower part of the original finding holds.)

### Confirmed-correct baseline (the invariant genuinely holds here)

- **Double-entry balance** (`createJournalEntry`) rejects an unbalanced entry and accepts a balanced one — this one already works exactly as the PRD's invariant #1 requires.
- **The canonical, happy-path flow** (CFO creates an invoice → journal posts → `_journalPosted: true`; CFO creates a payment → journal posts → invoice flips to paid) all work correctly when performed by an authorized role with no edge-case interference. The deviations above are real, but they don't mean the whole module is broken — most of the core flow is sound.

### Another corrected finding — D1's failure mode is different than originally claimed

The original inventory described `GET /api/test-invoice-counter` as something that "permanently consumes two real invoice numbers" on every hit, silently. **Run against the real emulator with no signed-in user (the actual production condition for this route), it instead throws `permission-denied`** — `getNextInvoiceNumber()`'s transaction touches the `metadata` collection, whose rule requires `isAuth() && (canManageFinance() || isSalesRep())`; with no Firebase Auth session attached to this server-side client-SDK call, `isAuth()` is false and the write is rejected. Confirmed: the counter is **not** advanced when this throws (checked directly against the emulator's data).

This is still a real bug — it's a debug/test endpoint with zero auth checks, shipped to production, that will 500 on every request — but it is a **crash bug**, not a **silent-data-corruption bug**. Worth confirming this matches what actually happens on the deployed Vercel project, since that depends on the production Firestore rules genuinely matching this repo's `firestore.rules` and on no service-account/admin context being attached to that route that would bypass the check locally-unreplicated reasons.

## What this doesn't cover yet

This run covers Finance & Tax only (the module you picked first), and within it, the mutation paths reachable through `finance-service.ts`, `expense-service.ts`/`accounting/expenses.ts`, `accounting/journal-entries.ts`, and `accounting/vat-return.ts`. Not yet covered: payroll journal posting, the year-end close, the backfill/reconciliation functions, and PAYE/CIT calculations.
