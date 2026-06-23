# CRM, Procurement & Subscriptions — Invariant Test Suite Results

> Detection only. No application code was changed. Run via `npm run test:emulator`.
> Tests live under `tests/crm/`, reusing the existing harness — no new infrastructure
> was needed this round (a sign the harness from the first two modules generalizes).

## One new harness helper added

`deleteDocAsAdmin()` — `leads` has `allow delete: if false` unconditionally for every role via the client SDK, so simulating a realistic "the lead was deleted by something else between read and write" race required a rules-bypassing delete, not a regular client-SDK one.

## A correction to my own earlier PRD, caught before it became a false "deviation"

The PRD's persona table described CFO/Finance Officer as owning "vendor relationships, PO approval-to-payment." Checking `firestore.rules`' `canManageProcurement()` directly: it's `isRootAdmin() || isSystemAdmin()` — **nobody else, including CFO**. Cross-checked against `roles.ts`: CFO and Finance Officer both have `view:procurement` only, never `manage:procurement`. The UI's own gate (`procurement/orders/page.tsx`) correctly checks `hasPermission(role, "manage:procurement")`, so the missing button for CFO is **consistent, intentional behavior** — confirmed by testing that CFO is rejected creating a PO and System Admin succeeds end-to-end. This is a correction to the PRD's description of who does what, not a code deviation — recorded here so it doesn't get mistaken for one later.

## Confirmed deviations (matching the PRD's D-numbers, with real reproduced evidence)

| # | Test | Expected (invariant) | Actual (reproduced) |
|---|---|---|---|
| D1 | `convertToClient` | One atomic conversion event | Simulating a realistic race (the lead is deleted between read and write — e.g. a duplicate-merge or cleanup job), the client document is created successfully and then **permanently orphaned** — the lead update throws, there is no rollback, and nothing links the orphaned client back to a "failed conversion" state |
| D2 | CRM-embedded vs. top-level subscriptions | One business concept, one data model | A subscription added via `addSubscription` on a client's CRM profile is confirmed present on the client doc, but `getPortalSubscriptions` (the actual function the client portal calls) returns **zero** results for that same client — confirmed the portal reads exclusively from the unrelated top-level `subscriptions` collection |
| D3 | "Cancelled" representation | One encoding | Top-level `subscriptions.cancelled` is confirmed to persist as a JS `boolean`; the CRM-embedded `ClientSubscription.status` is confirmed to persist as the string `"cancelled"` — structurally incompatible for the identical fact |
| D4 | Subscription renewal | Exactly one invoice + one journal entry, however triggered | `renewSubscription()` (the actual exported service function) is confirmed to touch only the `subscriptions` collection — no invoice, no journal entry, no dedupe key recorded anywhere. (The invoice-creation logic for a manual renewal lives as separate, hand-rolled code inside the page component, not in the service layer at all — there is no single canonical "renew" function to point at) |
| D6 | PO lifecycle / cancellation | Every legitimate state reachable | `updatePOStatus(id, "cancelled", ...)` works correctly end-to-end when called directly — confirmed the gap is purely a missing UI affordance (`orders/page.tsx`'s status-advance button only walks forward), not a missing capability anywhere in the service, rules, or type layer |
| D8 | Client-to-invoice matching | One result set regardless of screen | For an invoice billed to "Acme Holdings **Limited**", an exact-match query for "Acme Holdings **Ltd**" (what the portal does) returns zero results, while the CRM client profile's fuzzy substring algorithm matches it — same client, same invoice, opposite verdicts depending which screen is asking |
| D5 | Client portal access | Never a false "you have nothing" | A client whose user doc lacks `portalBillingCompany` gets a genuine `permission-denied` (confirmed via error `.code`) reading their own company-keyed invoice — the same client succeeds immediately once that one field is set to match |

## D7 — confirmed at the root, but the masking behavior itself isn't unit-testable

`ClientAuthContext`'s blanket catch-all (which reduces any failure to "not a client") is React Context UI code with no meaningful way to exercise via a service-layer test. What **is** confirmed directly: the underlying read it would be catching genuinely throws `permission-denied` (the D5 test above) — so the root cause D7 describes is real and reproduced; only the specific claim "the UI then shows this identically to a real empty state" remains unverified by this suite (it would need a rendered-component test, out of scope for this pass).

## Confirmed-correct (the invariant genuinely holds here)

- The happy-path lead-to-client conversion (lead still exists, nothing races it) completes both writes correctly: client created, lead marked `stage: "client"` with a correct back-reference.
- A top-level subscription, queried through the portal's own function, is found correctly — the portal's *own* collection model works fine in isolation; the problem is purely that a second, unrelated model exists alongside it.
- The full PO lifecycle (create → approve → deliver → pay → journal entry posted) works correctly end-to-end for System Admin, the one role it's restricted to.

## What this doesn't cover yet

Vendor rating aggregation, lead auto-assignment (`getLeastLoadedStaff`), and the cron-triggered subscription-renewal path (`api/cron/subscriptions`) itself weren't exercised this round — the PRD's D4 finding about that cron path was confirmed structurally (via reading) but not re-verified by running the actual cron handler against the emulator in this pass.
