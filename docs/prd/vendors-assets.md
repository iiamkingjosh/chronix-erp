# Vendors & Assets — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md).
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.
>
> One deviation in this document (Assets D1) was investigated and **fixed in the same session this audit was written** (commit `ed220e6`). It's left in the deviation list, marked resolved, rather than removed — the fix is recent enough, and the root cause instructive enough, that future readers should see what was wrong and how it was closed, not just that it's fine now.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

**Vendors** is the supplier registry for procurement — supplier contact info, category, payment terms, active/inactive status, and a 1-5 star performance rating fed by Purchase Order history. It exists to support procurement decision-making (who do we buy from, are they reliable), not just to be a contact list. It lives entirely under `/dashboard/procurement` — there is no standalone `/vendors` route; the vendor list *is* the procurement landing page.

**Assets** is an IT equipment/device inventory and assignment tracker — laptops, servers, network gear, phones, printers, monitors, UPS units, software licenses. It is grouped on the operations dashboard alongside Tickets, Incidents, Changes, and On-call, confirming its intended audience is IT operations, not finance. It is **not** a financial fixed-asset ledger — there is a completely separate, GL-account-based "Fixed Assets" concept on the Balance Sheet that has no connection to this module at all (see §1.3 invariant 4 and Assets D4).

### 1.2 Personas / roles

| Role | Vendors | Assets |
|---|---|---|
| **Root Admin** | Full access (wildcard) | Full access (wildcard) |
| **System Admin** | `manage:procurement` — create/update vendors, ratings | `manage:assets` — full create/update |
| **IT Manager** | `view:procurement` only (read) | `manage:assets` — the module's primary intended user |
| **HR** | No access | `manage:assets` (rule-permitted via `canManageHR()`; UI fixed today to match) |
| **CEO** | `view:procurement` only (read) | Permitted by rule (`isCEO()` directly) and UI, via a hardcoded check rather than a permission — see Assets D1 |
| **CFO / Finance Officer** | `view:procurement` — read vendor info, no write | No access |
| Everyone else (authenticated) | No access | **Read-only access to everything** — the Assets read rule is `isAuth()` with no role restriction at all |

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **Whoever a Firestore rule permits to mutate a collection must be offered that action in the UI.** A role that can legally write to `vendors` or `assets` per `firestore.rules` should see the corresponding button; a role the rule will reject should never see a button that fails silently on click.
2. **A field that names a business relationship (vendor, client, employee) must mean what its name says.** A `vendorName` field on a tax record should hold an actual vendor's name, not a different entity's name borrowed because no better field existed.
3. **A foreign-key-style reference (`vendorId`, `assignedToUid`, `clientId`) must either be a real, queryable link or not exist at all.** A field that's declared in the type but never populated by any code path is worse than no field — it implies a capability that was never built.
4. **Money captured at the operational layer (a vendor's invoiced PO, an asset's purchase cost) must be traceable to the same number in the financial ledger, or the two must be clearly understood as unrelated.** Two systems that could silently disagree forever with no reconciliation path is a standing risk, not a one-time bug.
5. **A list view backed by a capped query must communicate that cap to the user**, or provide pagination — silently dropping older records from search/filter/stat-counting past an arbitrary limit is indistinguishable from data loss to whoever's looking at it.
6. **A mutation that can fail must surface that failure to the user who triggered it.** A button that silently does nothing on rejection, or worse, stays disabled forever with no message, is a correctness bug regardless of whether the underlying permission check is itself correct.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms)                        SERVICE LAYER                              FIRESTORE                          EXIT
─────────────────                       ─────────────                              ─────────                          ────
procurement/vendors/new            →    procurement-service.createVendor       →    vendors (create)              →    vendor list
procurement/page.tsx               →    procurement-service.updateVendorStatus →    vendors (update active/inactive) → vendor list
procurement/vendors/[id]           →    procurement-service.addVendorRating    →    vendors (update, recompute avgRating) → vendor profile — UNGATED in UI, rule-rejected for most viewers (Vendors D1)
procurement/orders/new             →    procurement-service.createPO           →    purchase_orders (create, real vendorId FK + denormalized vendorName/vendorCategory snapshot) → PO list
procurement/orders                 →    procurement-service.updatePOStatus     →    purchase_orders (update); on "paid": auto-journal.createPOJournalEntry → journal_entries → Finance ledger (cross-module, correct)
procurement/vendors/[id] (PO history) → procurement-service.getPOsByVendor    →    purchase_orders (read, where("vendorId","==",...) — real server query)

tax/wht/page.tsx                   →    tax-service.createWHTRecord            →    withholding_tax (create, vendorName = free text or auto-filled from invoice's CLIENT name — see Vendors D2)

assets/new                         →    asset-service.createAsset              →    assets (create)                →    asset list
assets/[id] (assign)               →    asset-service.assignAsset              →    assets (update: status, assignedTo, assignedToUid, assignedAt, assignmentHistory append) → asset detail
assets/[id] (return)               →    asset-service.returnAsset              →    assets (update: status, assignedTo/assignedToUid/assignedAt set to null, history entry closed) → asset detail
assets/page.tsx (decommission)     →    asset-service.updateAssetStatus        →    assets (update status [+condition]) → asset list
assets/new, assets/[id] (assign picker) → hr-service.getEmployees              →    users (full-collection fetch, client-filtered — anti-pattern, lives in HR not Assets) → assignment dropdown
```

**Exit points**: the procurement vendor/PO dashboards (and cross-module into the Finance ledger when a PO is paid), the WHT record list (with a structurally mislabeled vendor link), the Assets list/detail pages, and — notably — **nothing exits Assets into Finance at all**; `purchaseCost` is captured and displayed and goes nowhere else.

### 2.2 Mutation paths — and which roles can actually reach them

| Conceptual operation | Rule allows | UI offers (before today's fix) | UI offers (after) |
|---|---|---|---|
| Create/update a vendor | `canManageProcurement()` = Root Admin, System Admin | Root Admin, System Admin (matches) | unchanged |
| Add a vendor rating | `canManageProcurement()` = Root Admin, System Admin | **Anyone who can view procurement** (CFO, Finance Officer, view-all roles) — no gate at all | unchanged — **not fixed in this pass, see Vendors D1** |
| Create/update an asset | `isSystemAdmin() \|\| isCEO() \|\| canManageHR() \|\| isITManager()` = Root Admin, System Admin, CEO, HR, IT Manager | Root Admin, System Admin, CEO — **IT Manager and HR silently excluded** | Root Admin, System Admin, CEO, HR, IT Manager — **fixed, matches the rule exactly** |

---

## PART 3 — DEVIATIONS

### VENDORS

#### Vendors D1 — Invariant #1 violated: vendor-rating UI offers an action most viewers can't actually perform
**Files**: `src/app/(dashboard)/dashboard/procurement/vendors/[id]/page.tsx:174-196` (`handleAddRating`, "Add Rating" form rendered unconditionally); `firestore.rules:365-369` (`vendors` rule, `allow create, update: if canManageProcurement()` — Root Admin/System Admin only); `firestore.rules:178-180` (`hasViewProcurement()` = `hasViewAll() || isCFO() || isFinanceOfficer()`, the much broader read gate the page itself uses to render at all).

Every other vendor mutation on this page is correctly wrapped in a `canManage` check. The rating-submission form is the one exception — it renders for any role that can view the vendor (CFO, Finance Officer, any `view:all` role), but `addVendorRating()` performs a Firestore `update`, which the rule restricts to Root Admin/System Admin. A CFO sees a fully interactive "Submit Review" button that will throw permission-denied on click.

This is compounded by a silent-failure bug: `handleAddRating()` has no `try`/`catch` around the `await addVendorRating(...)` call. The `finally` block resets the submitting state, but the thrown rejection itself is never caught — no error message is shown to the user. They click submit, nothing visibly happens, and the button becomes clickable again with zero explanation.

**Status: open, not fixed in this pass.**

#### Vendors D2 — Invariant #2 violated: `WHTRecord.vendorName` holds a client's name, not a vendor's
**Files**: `src/types/tax.ts:38-53` (`WHTRecord`, declares both `vendorName: string` and `vendorId?: string`); `src/app/(dashboard)/dashboard/tax/wht/page.tsx:438-470` (free-text vendor input, auto-fill-from-invoice sets `vendorName: inv.client.name`).

Confirmed against real production data: both real WHT records in production have `vendorName: "Mainland Oil and Gas"` — a CRM **client**, not a supplier. This isn't a coincidental bad entry; it's structurally how the feature works. In the real-world transaction this records (a client withholding tax before paying Chronix's invoice and remitting it to FIRS on Chronix's behalf), the client is the *payer*, not a vendor Chronix paid — the field name is conceptually backwards for this use case, not just unlinked.

Compounding this: `vendorId?` is declared on the type, presumably intended as a real foreign key into the `vendors` collection, but is **never populated by any code path** — confirmed both by codebase search and by real production data (both real WHT records have `vendorId: (none)`).

**Status: open.**

#### Vendors D3 — Invariant #5 violated: vendor list is hard-capped at 50 with no pagination or indication of truncation
**File**: `src/lib/procurement-service.ts` (`getVendors()`, `query(collection(db, VND), orderBy("createdAt","desc"), limit(50))`).

The query itself is correctly server-side (not the full-unbounded-fetch anti-pattern found in CRM/Tickets), but the cap is silent. Once vendor count exceeds 50, the list page's search box, status filter tabs, and any future "total vendors" stat will only ever operate on the 50 most-recently-created vendors — older vendors become invisible to search with no error, no "showing 50 of N" indicator, and no "load more" control.

**Status: open.** (Currently low-impact in practice — real production data shows exactly 1 vendor — but the defect is in the code regardless of current volume.)

#### Vendors D4 — dead fields: `createdBy`, `updatedAt` written, never displayed
**File**: `src/types/procurement.ts:14-30` (`Vendor`); confirmed via UI search across `procurement/page.tsx` and `vendors/[id]/page.tsx` — neither field is rendered anywhere.

Both fields are faithfully written at creation and bumped on every status/rating change, but no vendor page ever shows an "added by" or "last updated" timestamp. Not a correctness bug — the audit log separately captures creates/rating-adds — but it's scaffolding for a UI feature (an attribution/freshness trail) that was apparently planned and then never surfaced.

**Status: open**, cosmetic-only.

---

### ASSETS

#### Assets D1 — Invariant #1 violated: IT Manager rule-permitted, UI-blocked entirely — **FIXED TODAY** (commit `ed220e6`)
**Files**: `firestore.rules:493-498` (`allow create, update: if isSystemAdmin() || isCEO() || canManageHR() || isITManager()`); `src/app/(dashboard)/dashboard/assets/page.tsx` and `assets/[id]/page.tsx` (the `canManage` checks, before the fix: `isRootAdmin() || hasPermission(role,"manage:hr") || role==="System Admin" || role==="CEO"` — never checked IT Manager).

This was the inverse of the usual UI-vs-rule mismatch pattern: here the **rule was correctly permissive and the UI was the thing that was wrong**. IT Manager — the role this entire module's dashboard KPIs, category list (laptops/servers/network gear), and sidebar grouping are obviously built for — was rule-authorized to create, assign, return, and decommission assets, but saw zero action buttons anywhere in the UI, because the page-level check tested `manage:hr` (an HR permission) instead of IT-relevant access.

A dedicated `manage:assets`/`view:assets` permission pair already existed in `roles.ts` and was already wired into `Sidebar.tsx`'s nav-gating (so IT Manager could see the link and navigate to the page), but **no Assets page logic ever consulted that permission** — both pages' `canManage` checks were almost certainly copy-pasted from an HR-adjacent page and never updated.

**Fix applied**: both pages now use `hasPermission(role, "manage:assets") || role === "CEO"`. `manage:assets` was added to HR's permission list to match the rule's `canManageHR()` clause (System Admin and IT Manager already had it). CEO is checked via a direct role comparison rather than added to CEO's permission list, deliberately preserving `roles.ts`'s documented "no operational manage:\* rights" design intent for CEO everywhere else — the rule's `isCEO()` clause for assets specifically is treated as a one-collection exception, not a reason to widen CEO's permissions generally.

Verified end-to-end against the real rule (not just button visibility): IT Manager genuinely creates/assigns/returns/decommissions an asset, each a real Firestore write read back and confirmed; Staff genuinely rejected on all three mutations; HR and CEO confirmed as the other two roles the fix needed to cover. 175/175 tests passing (6 new).

**Status: resolved**, commit `ed220e6`.

> **Why this matters for reading the rest of this document**: Assets has **zero real records in production** (confirmed by direct query). Given that D1 blocked the one role this module was clearly built for from ever successfully using it, the zero-usage is very likely a *direct consequence of D1*, not evidence of low organic demand for an IT asset registry. Every other deviation below (D3, D5, D6) describes a *latent* risk against data that, as of this audit, doesn't yet exist — they're real defects in the code, but none of them have had the chance to manifest against a real record yet. That changes how urgently they should be read: D1 was the blocker stopping the feature from being used at all; D3/D5/D6 are what will start mattering the moment someone (now able to, post-fix) actually uses it.

#### Assets D2 — Invariant #6 violated: zero error handling on any mutation
**File**: `src/app/(dashboard)/dashboard/assets/page.tsx` (`handleReturn`, `handleDecommission`) and `assets/[id]/page.tsx` (`handleAssign`, `handleReturn`) — none of the four wrap their service call in `try`/`catch`.

If any of `assignAsset`/`returnAsset`/`updateAssetStatus` rejects for any reason (a future rule tightening, a transient Firestore error, anything), the promise rejection is unhandled. Worse than the typical swallowed-error pattern found elsewhere in this codebase: there is no `finally` block clearing the `acting`/loading state either, so the clicked button is left stuck in its disabled "…"/"Processing…" state indefinitely, with no error message shown and no way to retry without a full page reload.

**Status: deferred — explicitly out of scope for the D1 fix, per instruction. Not fixed in this pass.**

#### Assets D3 — Invariant #3 violated: dead `clientId` field, fragile `clientName` text-match — same pattern as the CRM/subscription client-name-matching issue
**File**: `src/types/asset.ts:5-35` (`Asset.clientId?: string` and `Asset.clientName?: string`); `src/app/(dashboard)/dashboard/assets/new/page.tsx` (only `clientName`, a free-text input, is ever set; `clientId` has no corresponding form field anywhere).

`clientId` — presumably intended as the real foreign key into the CRM `clients` collection — is declared on the type but confirmed (via codebase-wide search) never written by any code path and never read. Only the free-text `clientName` does any real work, carrying the identical fragile-string-match risk documented elsewhere this session (the "Mainland Oil and Gas" client-name-matching gap): if an asset's recorded client name doesn't exactly match the real `clients` collection record's company name, there is no way to programmatically join the two, and no code currently even attempts it — `clientName` is purely a display label today, not a queryable link to anything.

**Status: open.**

#### Assets D4 — Invariant #4 violated: no Finance/GL integration at all
**Files**: `src/types/asset.ts` (`purchaseCost?: number`, captured at creation, never adjusted); `src/lib/accounting/balance-sheet.ts:45-58` (the Balance Sheet's "Fixed Assets" section, which pulls from chart-of-accounts GL balances, account codes `1400`/`1500`, entirely independent of the `assets` Firestore collection).

An asset's `purchaseCost`, entered once at creation, never creates a journal entry, is never linked to the Purchase Order or expense that actually paid for it, and has zero effect on the Balance Sheet. No depreciation schedule, accumulated-depreciation tracking, or value-adjustment mechanism exists anywhere. The Assets list page's "Total Value" stat (a client-side sum of all `purchaseCost` fields) and the real Balance Sheet's "Total Fixed Assets" figure are two completely disconnected numbers that could disagree forever with no reconciliation path — and, per invariant #4, that's a standing risk even though right now (with zero real assets) there's nothing yet to disagree.

**Status: open.**

#### Assets D5 — Invariant #3 violated (orphan risk): no check for a deleted/offboarded employee still referenced as `assignedToUid`
**Files**: `src/lib/asset-service.ts` (`assignAsset`, `returnAsset` — neither validates that `employeeUid` still resolves to a real, active employee at read time); `src/lib/hr-service.ts:156-162` (`getEmployees()`, the dropdown source, silently excludes an employee the moment they stop qualifying as an "HR employee record" — but does nothing to existing asset assignments to that employee's uid).

`assignedToUid` is a real, correctly-implemented foreign key (unlike Vendors D2 or Assets D3) — but nothing in the codebase ever checks whether it still resolves to an existing, active user. If an employee is offboarded while assets remain assigned to them, both the asset list and detail pages will continue displaying the frozen `assignedTo` name forever, with no warning, no "this employee is no longer active" flag, and no prompt to reassign or return the asset.

**Status: open.** Currently zero real assets exist, so this risk is entirely latent — it will start mattering the first time an assigned asset's holder leaves the company.

#### Assets D6 — type/runtime mismatch: `returnAsset()` writes literal `null` into fields typed as `string | undefined`
**File**: `src/lib/asset-service.ts:54-60` (`returnAsset`, sets `assignedTo: null, assignedToUid: null, assignedAt: null`); `src/types/asset.ts` (these fields are declared `string | undefined` / similar — never `null` in the type).

Firestore accepts the `null` writes without complaint, and today's UI code happens to handle it correctly via nullish-coalescing checks, but any `Asset` document read back after a `returnAsset()` call has fields whose runtime value (`null`) the type system claims can never occur. A future consumer of the `Asset` type doing a strict `typeof x === "string"` check or a destructure with a non-nullish default would silently misbehave against real data shaped exactly this way.

**Status: open**, low-severity until a new consumer of the type is written without awareness of this gap.

---

## Production data snapshot (confirmed via direct read-only query, same session as this audit)

| Collection | Real count | Notes |
|---|---|---|
| `vendors` | **1** | `HOLARWUMITE COMPUTER TECH` — active, category `consumables`, zero ratings |
| `purchase_orders` | **2** | Both `paid` (₦660,000 + ₦625,000), both correctly carry a real `vendorId` resolving to the one real vendor — confirms the Vendor↔PO foreign key genuinely works in production, not just in theory |
| `withholding_tax` | 2 | Both reference `vendorName: "Mainland Oil and Gas"` (a client, not a vendor — Vendors D2), both `vendorId: (none)` |
| `assets` | **0** | See Assets D1's note above — this is very likely a direct consequence of the permission-gate bug blocking IT Manager, the module's intended primary user, rather than evidence of low organic demand for the feature |

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Should `WHTRecord.vendorName` (Vendors D2) be renamed to reflect that it actually records the *payer* in a client-withholds-and-remits scenario, or is there a genuine separate "vendor WHT" use case (Chronix withholding tax on a payment *to* a supplier) that the current free-text field is meant to also cover, just never exercised yet in real data? This determines whether the fix is a rename, a split into two fields, or wiring up the dead `vendorId` to actually point at `vendors`.
- Is the Assets module intended to ever connect to Finance (depreciation, GL-linked value tracking), or is `purchaseCost` deliberately just an informational/insurance-reference number with no accounting weight? This determines whether Assets D4 is a real gap to close or a non-issue by design.
- Now that Assets D1 is fixed and IT Manager can actually use this module, should `clientId` (Assets D3) be wired up properly (a real client picker) before any real data accumulates with the fragile `clientName` text field, to avoid inheriting the same retroactive-cleanup problem CRM's "Mainland Oil and Gas" gap required?
