# Incidents & Audit Log — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md)
> and [`vendors-assets.md`](./vendors-assets.md) (same format/depth).
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.
>
> Two findings from yesterday's IT Ops audit — D3 (`closeIncidentWithRCA` requiring `status === "resolved"` first) and D4 (audit logging moved into `updateIncidentStatus`/`closeIncidentWithRCA`/`updateChangeStatus` themselves) — were re-verified directly against the current code before this investigation began. **Both confirmed still correctly in place**: `incident-service.ts` checks `incident.status !== "resolved"` before allowing RCA close, and `logAuditEvent()` is called inside `updateIncidentStatus`, `closeIncidentWithRCA`, and `change-service.ts`'s `updateChangeStatus`. They are not re-reported as open findings below.
>
> One deviation in this document (Incidents D1) was investigated and **fixed in the same session this audit was written** (commit `f3b9897`), the same day as the investigation itself. As with Assets D1 in `vendors-assets.md`, it's left in the deviation list marked resolved rather than removed, since the root cause is instructive for future readers.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

**Incidents** is an IT incident-management / on-call response tracker — severity (P1-P4), a lifecycle status (open → investigating → mitigated → resolved → closed), an incident lead, a running update timeline, and a closing root-cause-analysis (RCA) form (root cause, actions taken, prevention plan). It lives at `/dashboard/incidents`, grouped in the sidebar alongside Assets, Changes, and On-Call.

**Audit Log** is a centralized, append-only, system-wide compliance/forensic trail: who (actor) did what (action) to which entity (module/entity), intended to span every business module in the ERP. It is a single Firestore collection, `audit_logs`, written via `logAuditEvent()` in `src/lib/audit-service.ts`, and read on one dedicated page, `dashboard/audit/page.tsx`. Unlike most cross-cutting models in this codebase, `AuditLog` is **not** declared in `src/types/` — the type lives entirely inside `audit-service.ts` itself, alongside its read/write functions.

### 1.2 Personas / roles

| Role | Incidents (rule) | Incidents (UI) | Audit Log (rule, read) | Audit Log (UI, read) |
|---|---|---|---|---|
| Root Admin | full (wildcard) | full | Yes | Yes |
| System Admin | full | full management access | Yes | Yes |
| CEO | `view`+`manage` per rule | full management access | Yes | Yes |
| CFO | `update` per rule | full management access | No | No |
| IT Manager | `update` per rule | full management access | No | No |
| **Executive Assistant** | not rule-permitted | read/create only (correctly excluded from management) | **Yes, rule-permitted** | **No — silently blocked** |
| Everyone else (authenticated) | `read` only; `create` is universal | read + create only; management buttons correctly hidden | No | No |

This table reflects the **current, post-fix** state (Incidents D1, resolved in commit `f3b9897`). Before the fix, the "Incidents (UI)" column read "full" for every single role, with no distinction at all — that was the bug; see Incidents D1 below for exactly what was wrong and how it was fixed.

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **A role the Firestore rule permits must be offered the matching action in the UI, and a role the rule rejects must never be shown a button that will silently fail.** (Same invariant family as Vendors/Assets, applied to both modules here — Incidents violates it in the "UI offers too much" direction; Audit Log violates it in the "UI offers too little" direction.)
2. **Every sensitive/compliance-relevant mutation must produce exactly one audit entry, written through one consistent path** — not selectively, not via parallel bypass mechanisms with different schemas.
3. **An audit entry, once written, must be permanently immutable** — no role, including Root Admin, should ever be able to edit or delete history.
4. **A field declared on a shared type should be populated by every writer, or removed** — an unused field or enum member signals planned-but-abandoned scope.
5. **A capped, non-paginated list must make its cap visible**, or the user has no way to know they're looking at a partial picture.
6. **A "linked X" field that exists on a type must either be a real, populated, queryable reference, or not exist at all.**

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY                                   SERVICE LAYER                            FIRESTORE                EXIT
─────                                   ─────────────                            ─────────                ────
incidents/new                      →    incident-service.createIncident      →   incidents (create)   →   incident list
incidents/page.tsx,                →    incident-service.updateIncidentStatus →   incidents (update)   →   list + detail
  incidents/[id]/page.tsx
incidents/[id]/page.tsx            →    incident-service.addIncidentUpdate   →   incidents (arrayUnion onto updates[]) → timeline
incidents/[id]/page.tsx (RCA modal)→    incident-service.closeIncidentWithRCA →  incidents (update + rootCause/actionsTaken/preventionPlan) → detail

~40 page handlers + ~10 service        logAuditEvent() (mixed await/         →   audit_logs (create-   →   audit log page only
  functions, spanning nearly             fire-and-forget/uncaught)               only, immutable)
  every module
api/admin/users/create/route.ts    →    direct adminDb.collection           →   audit_logs (bypasses
  (Admin SDK, can't use client SDK)      ("audit_logs").add(...)                 logAuditEvent entirely)
api/notifications/send/route.ts    →    recordAudit() wrapper, direct        →   audit_logs (bypasses,
  (Admin SDK)                            adminDb write                            extra untyped fields)
dashboard/audit/page.tsx           →    getAuditLogs(500)                    →   audit_logs (read,    →   Audit Log table,
                                          orderBy("timestamp","desc")              capped)                  client-filtered, CSV export
```

**Incidents exit points**: the list/detail pages only. No other module reads from `incidents` — `linkedTickets`/`linkedChange` exist on the type but nothing ever populates or reads them (see Incidents D4).

**Audit Log exit points**: exactly one — the Audit Log page itself. `getAuditLogsByModule()`/`getAuditLogsByUser()` exist in `audit-service.ts` but are never called anywhere — dead exports.

### 2.2 Mutation paths — Incidents

**Post-fix state** (Incidents D1 resolved, commit `f3b9897`):

| Function | File | UI caller | UI-side role gate | firestore.rules gate |
|---|---|---|---|---|
| `createIncident` | `incident-service.ts` | `incidents/new/page.tsx` | None — deliberately unchanged, see Incidents D1 | `allow create: if isAuth()` — everyone |
| `updateIncidentStatus` | `incident-service.ts` | `incidents/page.tsx`, `incidents/[id]/page.tsx` | `canManage` — `isRootAdmin()\|\|role==="System Admin"\|\|role==="CEO"\|\|role==="CFO"\|\|role==="IT Manager"` | `isRootAdmin()\|\|isSystemAdmin()\|\|isCEO()\|\|isCFO()\|\|isITManager()\|\|resource.data.createdBy==uid` |
| `addIncidentUpdate` | `incident-service.ts` | `incidents/[id]/page.tsx` | Same `canManage` | same `update` rule |
| `closeIncidentWithRCA` | `incident-service.ts` | `incidents/[id]/page.tsx` (modal) | Same `canManage`, plus flow-gated (`status==="resolved"`, confirmed already-fixed D3) | same `update` rule |

(Before the fix, the "UI-side role gate" column read "None" for all three management functions — that was Incidents D1, detailed in Part 3 below.)

### 2.3 Every writer — Audit Log, the complete list

`grep -rn "logAuditEvent("` returns **64 occurrences across 42 files**. Confirmed, organized by layer:

**Service-layer** (`src/lib/*.ts`) — the most consistent layer: `auth-service.ts` (`signUp`/`signIn`, bare), `AuthContext.tsx` (sign-out, bare), `finance-service.ts` (`createInvoice`, `createPayment`, `updateInvoiceApproval` — all `.catch()`-chained), `expense-service.ts` (`updateExpenseStatus`, `.catch()`-chained), `hr-service.ts` (`updateEmployeeSalary`, **awaited**), `budget-service.ts` (`setBudget`, bare, no `.catch` at all), `incident-service.ts` (`updateIncidentStatus`, `closeIncidentWithRCA` — both **awaited**), `change-service.ts` (`updateChangeStatus`, **awaited**), `tickets-service.ts` (`overrideSlaDeadline`, **awaited**), `procurement-service.ts` (PO status update, `.catch()`-chained).

**Page-layer** — all bare, non-awaited, no `.catch`, inside client event handlers, spanning: tickets, CRM, knowledge base, HR (note/reactivate/suspend/delete/create), leave, disciplinary, changes, incidents (create only — see Incidents D5), assets, projects, subscriptions, procurement (vendor rating/create, PO create), finance (payments, invoices, expenses), tax (WHT/VAT/PAYE — all three mistagged, see Audit D6).

**Bypass paths — write directly to `audit_logs`, skip `logAuditEvent()` entirely:**
1. `api/admin/users/create/route.ts` — Admin SDK, necessarily bypasses the client-SDK-based `logAuditEvent`.
2. `api/notifications/send/route.ts`'s `recordAudit()` wrapper — same Admin SDK reason, but writes untyped extra fields (`targetRoles`, `permissionGranted`, `pushSent`, `emailSent`) the `AuditLog` interface doesn't declare.

**Confirmed not audited at all**: `api/notifications/push/route.ts` — push-token delivery has zero audit trail (only the `send`/broadcast route is audited).

### 2.4 Read path — Audit Log

Rule (`firestore.rules:518-523`):
```
match /audit_logs/{logId} {
  allow read:   if isAuth() && (isRootAdmin() || isCEO() || isSystemAdmin() || isExecutiveAssistant());
  allow create: if isAuth();
  allow update, delete: if false;
}
```

UI gate (`dashboard/audit/page.tsx`):
```ts
const canView = profile
  ? isRootAdmin(profile.role) || profile.role === "CEO" || profile.role === "System Admin"
  : false;
```

**These do not match** — Executive Assistant is rule-permitted, UI-blocked. See Audit D1.

Also note: `allow create: if isAuth()` places no restriction on *who* can write or *what* gets written beyond authentication — any authenticated user could, in principle, write an arbitrary document to this collection directly via the client SDK, not just through the app's own logging call sites. Not currently exploitable through any UI form, but a real latitude in the rule worth knowing about.

---

## PART 3 — DEVIATIONS

### INCIDENTS

#### Incidents D1 — Invariant #1 violated (UI offers too much): zero role gating on any mutation — **FIXED** (commit `f3b9897`)
**Files**: `incidents/page.tsx`, `incidents/[id]/page.tsx`, `incidents/new/page.tsx`.

**Precisely what the gap was**: this is the same invariant-#1 *category* as Vendors D1 and Assets D1 (a UI-vs-rule mismatch), but a different *shape* within that category, worth stating exactly rather than lumping together. Vendors D1 was one ungated exception on an otherwise-correctly-gated page. Assets D1 had a real gate that checked the wrong permission. **Incidents D1 was neither — there was no `canManage`-style check anywhere in this module at all.** Every status-transition button, the "Post" timeline-update button, and the "Close with RCA" button rendered unconditionally for any authenticated user who reached the page. The Firestore rule was never the problem — it was already correctly restricted to `isRootAdmin() || isSystemAdmin() || isCEO() || isCFO() || isITManager()` (plus the separately-tracked dead `createdBy` clause, see Incidents D2 below) — the UI simply never had a gate built for it, on any of the three pages, ever. In normal flows the sidebar's nav-gate kept most unauthorized roles from finding the link, but the dashboard layout's bare `<ProtectedRoute>` (no `requiredPermission`/`allowedRoles` prop) meant any authenticated user navigating directly to `/dashboard/incidents` by URL reached a fully-rendered page with active buttons that threw uncaught permission-denied rejections on click.

**Investigation, confirmed before fixing**: `change_log` (the real Changes collection) was checked independently and does **not** share this gap — its rule has the identical five-role set with no escape hatch, and `changes/page.tsx` already gates correctly with a hardcoded role check: `isRootAdmin(profile.role) || profile.role==="System Admin" || profile.role==="CEO" || profile.role==="CFO" || profile.role==="IT Manager"`. That comparison is what confirmed Incidents' gap was real and not a misreading of the rule.

**Fix applied**: replicated `changes/page.tsx`'s exact pattern verbatim — a hardcoded role check, not `hasPermission()`. This is a deliberate, confirmed choice: `roles.ts`'s `manage:incidents` permission string is only granted to System Admin and IT Manager (+ Root Admin via wildcard); CEO and CFO have no corresponding permission at all, even though the rule includes both directly via `isCEO()`/`isCFO()`. A `hasPermission()`-based check would have under-served CEO/CFO exactly the way it would have for Assets D1's CEO case. `canManage` now gates the three status-transition buttons (list and detail page), the timeline-post input/button, and the RCA-close button — applied identically on both `incidents/page.tsx` and `incidents/[id]/page.tsx`.

**Deliberately unchanged — read and create**: both remain `isAuth()` only, on the rule and in the UI. This was a confirmed decision, not an oversight: any staff member should be able to report an incident with minimal friction (anyone might be the first to notice an outage), and the rule already reflected that before this fix touched anything. Only the four *management* actions — deciding how an incident progresses, posting to its timeline, and writing its RCA — needed the gate, since those are judgment calls that belong to the same ops-admin set Changes already restricts them to.

**Verified end-to-end against the real rule**, not just button visibility: each of the five management roles (Root Admin, System Admin, CEO, CFO, IT Manager) genuinely performs a status change, timeline post, and RCA close; Staff genuinely creates an incident (confirming create stayed open) but is genuinely rejected on all three management actions; Changes confirmed unaffected by the change (System Admin still succeeds, Staff still rejected, exactly as before). 182/182 tests passing (7 new).

**Status: resolved**, commit `f3b9897`.

#### Incidents D2 — dead rule clause: `resource.data.createdBy` can never be true
**File**: `firestore.rules` (incidents `update` rule includes `|| resource.data.createdBy == request.auth.uid`); `Incident` type — confirmed it has **no `createdBy` field at all**, and `createIncident`'s payload (built from the create form) never sets one.

Every real incident document will have `resource.data.createdBy` evaluate to `undefined`, so this clause can never be true against any real document — pure dead weight, almost certainly copy-pasted from a different collection's rule (e.g. Tickets, which does have a real `createdBy`).

**Status: open.**

#### Incidents D3 — silent failure on RCA close
**File**: `incidents/[id]/page.tsx` (`handleCloseRCA`) — has a `try`/`finally` but no `catch`; the `finally` only resets the `acting` flag.

If `closeIncidentWithRCA` throws (the already-fixed "must be resolved" guard, or a rule rejection — e.g. a future regression in the now-fixed Incidents D1 gate, or any direct call bypassing the UI), the rejection is unhandled — no error message is shown, the modal just silently fails to close. The loading state is correctly cleared (unlike Assets D2's stuck button), but the user has zero feedback that anything went wrong.

**Status: open.**

#### Incidents D4 — dead cross-module link fields, both ends
**Files**: `Incident.linkedTickets?: string[]` and `Incident.linkedChange?: string` — confirmed never written by any code path (`createIncident`, `updateIncidentStatus`, `closeIncidentWithRCA` all omit them) and never read on either the list or detail page. `ChangeEntry` has no reciprocal `incidentId`/`linkedIncident` field at all — only its own dead `linkedTickets?: string[]`, also never written/read in `change-service.ts` or the Changes UI.

There is no "convert incident to change" workflow anywhere — no button, no service function, zero matches for `incidentId`/`fromIncident`/`convertIncident` across `src/`. Worse than Vendors D2's mislabeled-but-populated field: these are fully unpopulated on both ends, scaffolding for an integration that was never started, not just never finished.

**Status: open.**

#### Incidents D5 — On-call has zero linkage to incidents
**Files**: `OnCallSlot` type (`engineerUid`, `engineerName`, `weekStart`, `weekEnd`, `notes`) — no incident reference field; `oncall-service.ts` — zero matches for "incident" anywhere.

An incident does not record who was on-call when it was detected or escalated. On-call is a pure scheduling roster with no write-time or read-time connection to any incident document — these are fully separate, unintegrated concepts today.

**Status: open** (arguably by-design absence rather than a regression — flagged as a genuine open question for sign-off, see below).

#### Incidents D6 — inconsistent audit-logging ownership, and one path with none at all
**Files**: `incident-service.ts` — `updateIncidentStatus`/`closeIncidentWithRCA` both call `logAuditEvent` internally (already-confirmed-fixed D4 from yesterday); `createIncident` does **not** — its audit call instead lives in the calling page (`incidents/new/page.tsx`), bare/unawaited/no `.catch`, inconsistent with the service-owns-its-audit-logging pattern the other two functions establish. `addIncidentUpdate` (posting a timeline entry) has **no audit logging from any layer** — a user can post arbitrary text to any incident's timeline with zero audit trail, the only mutation in this module with that gap.

**Status: open.**

---

### AUDIT LOG

#### Audit D1 — Invariant #1 violated (UI offers too little): Executive Assistant rule-permitted, UI-blocked
**Files**: `firestore.rules:520` (includes `isExecutiveAssistant()`); `audit/page.tsx`'s `canView` (omits Executive Assistant entirely); `roles.ts` (`ROLE_PERMISSIONS[EXECUTIVE_ASSISTANT]` explicitly includes `"view:audit"`, as part of a documented "read-only mirror of the CEO's view" design comment).

Three independent sources of truth — the rule, the permissions table, and that table's own design comment — all agree EA should read the audit log. Only the page's hardcoded check disagrees. An EA visiting `/dashboard/audit` sees "Audit log is restricted to CEO and System Admin" — a message that's itself inaccurate per the rule. Mirror image of Assets D1 (there, the rule was correctly permissive and the UI under-served it; same pattern, different module).

**Status: open.**

#### Audit D2 — at least four compliance-sensitive mutations write zero audit entries
- **User role changes** (`staff/page.tsx`'s `saveRole()`, a bare `updateDoc(doc(db,"users",uid),{role:next})`) — **no audit call anywhere in this function.** Promoting or demoting a user to any role, including Root Admin or CFO, is completely unaudited. The single highest-value gap found in this entire investigation — role changes are exactly what a compliance trail exists to capture.
- `deleteInvoice` (`finance-service.ts`) — no audit call inside the service function; only logged if the calling UI page separately remembers to.
- `deleteExpense` (`expense-service.ts`) — same dead-zone pattern.
- `createEmployee` (`hr-service.ts`) — no audit call inside the service function; only logged at the calling page.

Common thread: every service-layer delete-shaped mutation found omits its own audit call, relying entirely on the UI caller remembering to log separately — fragile the moment a new caller (a script, an admin tool, a different page) calls the service function directly.

**Status: open.**

#### Audit D3 — two parallel bypass write paths with a different, unvalidated schema
**Files**: `api/admin/users/create/route.ts`; `api/notifications/send/route.ts`'s `recordAudit()`.

Both bypass `logAuditEvent()` for a defensible reason (Admin SDK can't use the client-SDK-based function), but `recordAudit()` takes `Record<string,unknown>` with zero type-checking, and both write fields (`targetRoles`, `permissionGranted`, `pushSent`, `emailSent`) the `AuditLog` interface doesn't declare. These are silently persisted but can never be rendered by the audit page, which only destructures the declared fields.

**Status: open.**

#### Audit D4 — `ipAddress` declared, dead everywhere; two `AuditModule` union members never used
**File**: `audit-service.ts`.

`ipAddress?: string` is populated by **zero** of the 64 writer call sites found — confirmed against real production data too (0 of 137 real audit entries have it set). For a forensic/compliance trail, the permanent inability to record actor network origin is a real gap, not cosmetic. Separately, `"payroll"` and `"time"` are declared in the `AuditModule` union but never used as an actual value — payroll events log under `module: "hr"` instead.

**Status: open.**

#### Audit D5 — 500-row read cap, no pagination, no "showing N of total" indicator
**File**: `audit/page.tsx` (`getAuditLogs(500)`).

The query itself is correctly server-side (`orderBy("timestamp","desc")` + `limit`), not an unbounded fetch — but there's no cursor, no "load more," no on-screen indication of truncation. The module filter, search, and event counter all operate purely client-side against this capped set; once real volume exceeds 500, search/filter silently stop covering anything older. **Real production volume today is 137 entries** — comfortably under the cap, so this is not yet biting in practice, but it's a near-certainty to matter as usage continues (see production data below).

**Status: open.**

#### Audit D6 — inconsistent module tagging: tax records and one payment action tagged under `"invoices"`
**Files**: `finance/payments/page.tsx` (payment-record handler logs `module:"invoices"` instead of the already-correct, already-used `"payments"` value); `tax/wht/page.tsx`, `tax/vat/page.tsx`, `tax/paye/page.tsx` (all tax-related audit calls tagged `module:"invoices"` — there is no `"tax"` value in the union at all).

A user filtering by `"payments"` or trying to find tax activity won't find these events. **Confirmed against real production data**: of 137 real entries, 23 are tagged `"invoices"` — some unknown fraction of which are actually tax/payment events misfiled here, versus genuine invoice events; the tagging makes it impossible to tell from the audit page itself.

**Status: open.**

---

## Production data snapshot (confirmed via direct read-only query, same session as this audit)

| Collection | Real count | Notes |
|---|---|---|
| `incidents` | **0** | Module entirely unused. Unlike Assets, this is **not** attributable to a permission-gate bug blocking the intended user — Incidents D1 found the *opposite* problem (zero gating, too permissive, not too restrictive). Zero usage here reads as genuine low/no adoption to date, not a blocked feature. |
| `changes` | **0** | Also entirely unused — consistent with zero incidents (nothing has triggered a change yet) and with Incidents D4's finding that no incident→change conversion path exists anyway. |
| `audit_logs` | **137** | Real range: 2026-05-11 to 2026-06-25 (~6 weeks of real usage). By module: `users` 88, `invoices` 23, `hr` 8, `expenses` 5, `projects` 6, `procurement` 2, `tickets` 2, `payments` 2, `subscriptions` 1. By action: `login` 72, `logout` 11, `create` 31, `update` 17, `delete` 5, `reject` 1. **Zero** of the 137 real entries have `ipAddress` populated (confirms Audit D4 with real evidence). **Zero** real entries have `actorRole: "Client"` (confirms the Client-role-removal orphan check came back clean — see below). Notably: zero real entries exist for `incidents`, `changes`, or `assets` modules at all — consistent with those collections having zero real records to generate audit events from. |

**Correction to an earlier speculative claim**: an initial pass of this investigation speculated that audit log volume was "very likely already past the 500-row cap" given the number of writer call sites in code. **Direct production query shows this is not the case** — real volume is 137, well under the cap. The cap (Audit D5) is a real defect in the code regardless, but it is not yet causing any visible truncation today.

### "Client" role removal — orphan check (explicit ask, confirmed clean with real evidence)

`grep -i "Client"` against `audit-service.ts` and `audit/page.tsx`: zero matches in either file. No leftover "Client" option in the module filter dropdown. **Direct production query of all 137 real audit log entries: zero have `actorRole: "Client"`.** Any such historical entry would still render correctly today regardless (the page renders `actorRole` as free text with no validity check), but none exist to test that path against. The audit module itself is clean.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Is Audit D1 (Executive Assistant blocked) an intentional UI restriction tighter than the rule on purpose, or a genuine bug? The rule, the permissions table, and that table's own design comment all agree EA should see it — reads as a bug, but confirm intent before fixing.
- Should role-change events (Audit D2) be audited at the same priority as salary changes already are — this reads as the most consequential gap found across both modules, but confirming priority avoids over-indexing relative to product's own risk model.
- Should `ipAddress` (Audit D4) actually be wired up (requires capturing it server-side — the client SDK has no access to the real caller IP), or should the field be removed from the type as abandoned scope?
- Is Incidents↔On-call linkage (Incidents D5) intentionally out of scope, or a planned integration that hasn't been built yet? This determines whether it's a deviation at all or just an accurate description of current scope.
