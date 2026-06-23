# CRM, Procurement & Subscriptions (+ Client Portal) — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md) §C.
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

This module covers the customer-facing side of the business: turning leads into clients (CRM), buying things from vendors (Procurement), and billing clients for recurring services (Subscriptions) — plus the external-facing Client Portal that lets a converted client see their own invoices, tickets, and subscriptions without an internal account. It is the bridge between "sales activity" and "money owed," and it is the second module (after Finance) that triggers ledger postings — via Purchase Orders and via auto-generated subscription renewal invoices.

### 1.2 Personas / roles

| Role | What they're meant to do here |
|---|---|
| **Sales Rep** | Owns the CRM pipeline (`manage:crm`), creates invoices off the back of deals, submits expenses, no procurement access. |
| **Brand Lead / Social Media Lead** | `manage:crm` — pipeline and client relationship ownership from the marketing/brand side. |
| **CFO / Finance Officer** | `manage:subscriptions`/`view:procurement` — owns vendor relationships, PO approval-to-payment, and subscription billing. |
| **System Admin** | `manage:procurement` — the only role with full vendor/PO write access per `firestore.rules`. |
| **Project Manager** | `view:crm` — read access for context, not pipeline ownership. |
| **Client (portal)** | External, separate auth context. Reads only their own invoices/tickets/subscriptions; can submit a support ticket. Never sees CRM internals (leads, vendors, other clients). |

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **Converting a lead to a client is one atomic business event.** A client record exists if and only if the originating lead is marked converted with a back-reference to that client. There must never be a client with no converted-lead trail, or a converted-marked lead with no client record.
2. **"This client's subscriptions" must mean the same thing everywhere.** Whatever a client is billed for and whatever the client portal shows them as their active subscriptions must be the *same set of records*, viewed through the *same* status vocabulary (active/expired/cancelled) — not two unrelated data shapes that happen to share a name.
3. **A subscription renewal produces exactly one invoice and exactly one journal entry, once, regardless of whether a human or the cron job triggered it.** The two must not be able to double-bill the same renewal period.
4. **A Purchase Order's status must be able to represent every state it can legitimately be in, including "this will never be paid."** A PO that's been cancelled must be representable as cancelled, not stuck forever in "pending."
5. **A client portal user sees exactly their own records — never another client's, and never a false "you have nothing" when the real cause is a misconfigured identity field.** Permission-denied-by-misconfiguration must never look identical to "you genuinely have no invoices."
6. **Finding "this client's invoices/tickets" must return the same result set no matter which screen is asking** — the CRM client profile and the client portal are answering the identical question and must agree.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms)                  SERVICE / API LAYER                          FIRESTORE                                  EXIT
─────────────────                 ───────────────────                          ─────────                                  ────
crm/leads/new                 →   crm-service.createLead                  →    leads (create)                        →    pipeline board (crm/page.tsx)
crm/page.tsx (drag-drop)      →   crm-service.updateLeadStage             →    leads (update stage + activity)       →    pipeline board
crm/leads/[id] (note/follow-up)→  crm-service.addLeadActivity / addFollowUp / completeFollowUp → leads (update)      →    lead detail, follow-ups page
crm/leads/[id] (convert)      →   crm-service.convertToClient             →    clients (create) + leads (update: stage=client, convertedAt, clientId) →  client profile

clients/[id] (add subscription)→  crm-service.addSubscription             →    clients (arrayUnion onto embedded `subscriptions[]`) →  client profile only — NOT visible to portal (see D2)
clients/[id] (notes)          →   crm-service.updateClientNotes           →    clients (update)                      →    client profile

procurement/vendors/new       →   procurement-service.createVendor        →    vendors (create)                      →    vendor list
procurement/vendors/[id]      →   procurement-service.addVendorRating     →    vendors (update, recompute avgRating) →    vendor profile
procurement/page.tsx          →   procurement-service.updateVendorStatus  →    vendors (update active/inactive)      →    vendor list
procurement/orders/new        →   procurement-service.createPO            →    purchase_orders (create)              →    PO list
procurement/orders            →   procurement-service.updatePOStatus      →    purchase_orders (update); on "paid": auto-journal.createPOJournalEntry → journal_entries → Finance ledger (cross-module)

subscriptions/new             →   subscriptions-service.createSubscription →   subscriptions (create)                →    subscriptions list
subscriptions/[id] (renew)    →   subscriptions-service.renewSubscription →    subscriptions (update expiry, renewalLog)
                                   + inline createInvoice call (NOT a service helper) →  invoices (create) — NO journal entry posted here →  finance/invoices (cross-module, incomplete)
subscriptions/[id] (cancel/notes/remind/vat) → subscriptions-service.cancelSubscription / updateSubscriptionNotes / toggleAutoRemind / setVatApplicable → subscriptions (update)

api/cron/crm (scheduled)      →   server-side, Admin SDK                  →    notifications (create) [reads leads for due follow-ups]
api/cron/subscriptions (scheduled) → server-side, Admin SDK               →    notifications (create); at 7-day band: invoices (create, with dedupe key) + journal_entries (create) + metadata counter (transactional) → Finance ledger (cross-module)

portal/login                  →   ClientAuthContext + client-portal-service.getClientByEmail → clients (read by email) →  portal session
portal/(auth)/invoices, /subscriptions, /tickets → client-portal-service (read-only, billing-key matched) → invoices/subscriptions/tickets (read) → client-facing views
portal/(auth)/tickets/new     →   client-portal-service.submitPortalTicket →   tickets (create, status="open")        →    tickets dashboard (internal, cross-module)
```

**Exit points**: the CRM pipeline board, lead/client detail pages, the vendor/PO dashboards (and cross-module into the Finance ledger when a PO is paid), the subscriptions list, the Client Portal's own read-only views, and — cross-module — `invoices` and `journal_entries` whenever a renewal or PO triggers them.

### 2.2 Mutation paths — and which ones do NOT share the same underlying logic

| Conceptual operation | Canonical path | Duplicate / divergent path(s) | Shared? |
|---|---|---|---|
| Record "this client has a subscription" | `crm-service.addSubscription` (writes embedded `clients.subscriptions[]`, schema: `name/type/monthlyValue/status` enum) | `subscriptions-service.createSubscription` (writes top-level `subscriptions` collection, schema: `itemName/renewalCost/expiryDate/cancelled` boolean) | ⚠️ **NOT shared — two unrelated schemas for the same business concept, never reconciled** |
| Represent "this subscription is cancelled" | `subscriptions-service.cancelSubscription` → boolean `cancelled: true` | CRM embedded subscription form → string `status: "cancelled"` | ⚠️ **NOT shared — boolean vs. enum for the identical state** |
| Generate a subscription renewal invoice | *(no canonical helper — should be one)* | `subscriptions/[id]/page.tsx` inline (`createInvoice`, no journal entry, no dedupe key, `round()` from `lib/utils`) **and** `api/cron/subscriptions/route.ts` inline (`invoices.add`, posts a journal entry, writes a dedupe key, different inline rounding) | ⚠️ **NOT shared — two independent implementations that can both fire for the same renewal** |
| Find "this client's invoices/tickets" | `client-portal-service.ts` (exact normalized-name / `client.id` match, used by the portal) | `clients/[id]/page.tsx` (fuzzy substring match on company name, loads *all* invoices/tickets client-side and filters) | ⚠️ **NOT shared — different precision, can disagree on results for the same client** |
| Advance a PO through its lifecycle | `procurement-service.updatePOStatus` | none found — single path, but the *flow array* driving the UI (`orders/page.tsx` `PO_FLOW`) only goes forward and has no entry point for `cancelled` even though that status exists in the type | ✅ Shared function, ❌ unreachable status |
| Post a PO's payment journal entry | `auto-journal.createPOJournalEntry` → `journal-entries.createJournalEntry` | none found | ✅ **Shared** |
| Determine client identity for portal billing-match | `client-portal-service.ts` queries (`client.name`/`clientName`, company-first) | `firestore.rules` `userPortalBillingMatches()` (checks `portalBillingCompany`/`portalBillingName`/`portalBillingEmail`/`tokenEmail()`) | ⚠️ **Two layers that must agree on a field that's frequently unset — see D5** |

---

## PART 3 — DEVIATIONS (explicit — bugs against the invariants in §1.3)

### D1 — Invariant #1 violated: lead-to-client conversion is not atomic
**File**: `src/lib/crm-service.ts:153-195` (`convertToClient`)
The `clients` doc is created (line ~174) *before* the source `leads` doc is updated to `stage:"client"` (line ~185). If the second write throws for any reason, a client record now exists with no lead ever marked as converted — and the UI's `catch` (`crm/leads/[id]/page.tsx` `handleConvert`) swallows the error entirely with no message, so the operator has no idea the conversion is half-done.

### D2 — Invariant #2 violated: two subscription models that never reconcile, and the portal only sees one of them
**Files**: `src/types/crm.ts:46-54` (`ClientSubscription`, embedded array on `clients`) vs. `src/types/subscriptions.ts:17-36` (`Subscription`, top-level collection); `client-portal-service.ts:78` reads only the top-level collection.
A subscription added via the client profile page (`clients/[id]/page.tsx`, `crm-service.addSubscription`) **will never appear to that client in the portal**, and the client-facing MRR/expiry data the portal shows will never reflect it. This is the single most consequential deviation in this module — it means client-visible billing state can silently diverge from what's actually been agreed/recorded internally on the CRM side.

### D3 — Invariant #2 violated: "cancelled" is a boolean in one model, a string enum in the other
**Files**: `subscriptions-service.ts:38-43` (`cancelSubscription` sets `cancelled: true`) vs. `clients/[id]/page.tsx` form (sets `status: "cancelled"` on the embedded array).
Same business state, two incompatible representations — any future code that tries to treat these as one concept (e.g. a unified "active subscriptions" report) will need to special-case both.

### D4 — Invariant #3 violated: renewal invoices can be created twice for the same period, and only one of the two paths posts a journal entry
**Files**: `subscriptions/[id]/page.tsx:72-100` (manual renewal — no journal entry, no dedupe key written) vs. `api/cron/subscriptions/route.ts:85-151` (cron renewal — posts a journal entry, writes a dedupe key, and explicitly checks for that key to avoid double-firing **on its own runs**).
Because the manual path never writes the dedupe key the cron path checks for, a human renewing a subscription a few days before the cron job's 7-day reminder window does *not* prevent the cron job from also generating a renewal invoice for the same period — and the manually-created invoice has no corresponding ledger entry at all (this is also a Finance-module invariant violation, cross-referenced from `docs/prd/finance-tax.md` invariant #2).

### D5 — Invariant #5 violated: client portal users without `portalBillingCompany` set get silent, indistinguishable-from-empty permission denials
**File**: `firestore.rules` `userPortalBillingMatches()` (gates portal reads on `tokenEmail() == resourceBillingKey OR portalBillingCompany == resourceBillingKey OR ...`) vs. `client-portal-service.ts` (builds queries keyed by company name first: `clientRecord?.company || clientRecord?.fullName || profile?.email`).
When a client's user doc has no `portalBillingCompany`/`portalBillingName` set, the rule falls back to comparing the resource's company-name key against the user's *email* — which will never match. The client-side query still executes and returns what *looks like* zero results, when the actual cause is a permission denial on every document. A legitimate client with this one field unset sees an empty portal with no error and no way to know why.

### D6 — Invariant #4 violated: no UI path exists to cancel a Purchase Order
**File**: `src/app/(dashboard)/dashboard/procurement/orders/page.tsx` `PO_FLOW = ["pending","approved","delivered","paid"]`.
`POStatus` (`types/procurement.ts`) includes `"cancelled"`, and `updatePOStatus` would happily accept it, but the only UI control is a forward "advance" button walking this fixed array. There is no reachable way to mark a PO cancelled from this domain's audited pages — a PO that the business has decided not to fulfill has no correct terminal state available.

### D7 — Invariant #5 violated: any portal auth/profile-load failure is indistinguishable from "you are not a client"
**File**: `src/contexts/ClientAuthContext.tsx` (catch block around the client profile load reduces *any* failure — network, Firestore rules, genuine absence — to `setProfile(null); setClientRecord(null);` with no logging and no surfaced error).
A transient Firestore outage or a misconfigured rule looks, from the client's perspective, identical to "this email isn't a registered client." There's no diagnostic signal anywhere for support staff to tell these apart from a bug report alone.

### D8 — Invariant #6 violated: the CRM client profile and the client portal can disagree on which invoices/tickets belong to a client
**Files**: `clients/[id]/page.tsx` (fuzzy substring match: `i.client.name.toLowerCase().includes(co) || co.includes(...)`, scanning *all* invoices/tickets client-side) vs. `client-portal-service.ts` (exact normalized-name match plus optional `client.id`).
The fuzzy match can pick up records the exact match would not (or vice-versa for near-miss company names) — an internal user looking at a client's profile and the client looking at their own portal are not guaranteed to see the same invoice list for what is supposed to be the same underlying question.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Was the CRM-embedded `ClientSubscription` array ever *intended* to be client-portal-visible, or is it meant purely as an internal MRR-tracking note unrelated to actual billed subscriptions? This determines whether D2's fix is "merge the two models" or "rename one of them to stop implying they're the same thing."
- Should the manual renewal flow (`subscriptions/[id]/page.tsx`) be retired in favor of always letting the cron job generate renewal invoices, or is manual early renewal a deliberate feature that the cron-side dedupe logic simply needs to be made aware of?
- What is `portalBillingCompany`/`portalBillingName` supposed to be populated from, and whose job is it to set it when a lead converts to a client? `convertToClient` does not set any portal-billing fields today — worth confirming whether that's an oversight or a separate manual step.
