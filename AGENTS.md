# AGENTS.md — Chronix ERP v2.0 Conventions

> Reverse-engineered from the actual codebase (see `docs/REVERSE_ENGINEERING_INVENTORY.md`
> and `docs/prd/*`), not aspirational. Every rule below either matches what most of the
> codebase already does, or exists specifically to stop a deviation found during that
> audit from happening again. If you're an agent (or a human) about to touch this repo,
> read the **Anti-Patterns** section before writing any mutation.

---

## 1. Stack (as actually used)

- **Framework**: Next.js (App Router), TypeScript, `strict: true`.
- **Data**: Firebase — **client SDK** (`firebase/firestore`, `firebase/auth`) for all browser-side reads/writes; **Admin SDK** (`firebase-admin`) only inside `src/app/api/**/route.ts` server routes, via the lazy singletons in `src/lib/firebase-admin.ts` (`getAdminAuth()`, `getAdminDb()`, `getAdminMessaging()`).
- **Security**: `firestore.rules` is the actual enforcement layer — not a formality. Every collection must have an explicit rule. There is a catch-all `match /{document=**} { allow read, write: if isAuth() && isRootAdmin(); }` at the bottom — **never rely on it** for a real feature; it exists as a break-glass for Root Admin only.
- **Forms**: `react-hook-form` + `zod` resolvers.
- **Styling**: Tailwind utility classes, no CSS modules.
- **Email**: Resend (`src/lib/email-service.ts`) — `sendEmail()` **never throws**; it resolves `{ sent: false, error/skipped }` on failure. Treat its return value as the source of truth, not the absence of a thrown error.
- **Push**: Firebase Cloud Messaging via Admin SDK (`src/lib/push-service.ts`).
- **Testing**: Vitest + the real Firebase Emulator Suite (Firestore + Auth), not mocks — `npm run test:emulator`. See §6.

---

## 2. File organization

```
src/
  app/
    (dashboard)/dashboard/<domain>/...     route groups, one folder per domain
    (auth)/login/                          public auth pages
    api/<domain>/.../route.ts              Admin-SDK server routes only
  lib/
    <domain>-service.ts                    ALL mutations for a domain live here
    accounting/                            ledger-specific services (journal-entries.ts, auto-journal.ts, vat-return.ts, ...)
    firebase.ts                            client SDK singletons (db, auth, storage)
    firebase-admin.ts                      Admin SDK lazy singletons
  types/
    <domain>.ts                            interfaces + labels + style maps + pure helpers, co-located
  components/                              shared, cross-domain UI only
  contexts/                                React context providers (AuthContext, ClientAuthContext)
docs/
  REVERSE_ENGINEERING_INVENTORY.md         master audit
  prd/<domain>.md                          per-domain PRD + architecture + deviations
  prd/<domain>-test-results.md             per-domain invariant test results
tests/
  helpers/                                 emulator harness — connectEmulators(), signInAs(), seedDoc(), etc.
  <domain>/*.test.ts                       one test file per concern within a domain
```

**Rule**: a new domain gets exactly one `<domain>-service.ts` (or one folder under `accounting/` if it's ledger-related) and exactly one `types/<domain>.ts`. Do not split a domain's mutations across two service files (see Anti-Pattern A1) and do not put a domain's types inline in a component file.

---

## 3. Naming conventions

- **Collection name constant**: every service file declares its collection name(s) as a local constant at the top — `const COL = "expenses";` or `const INV = "invoices";`. Never inline the string literal at each call site.
- **Function naming** (apply consistently to new service functions):
  - `createX(data)` → `addDoc`, returns the created entity with `id`.
  - `getX(id)` / `getXs()` → reads, plural for "all/list".
  - `updateXStatus(id, status, ...)` → the **one** function that transitions status; if the entity has a state machine, the guard lives inside this function (see `expense-service.ts updateExpenseStatus` for the canonical shape — `EXPENSE_TRANSITIONS` map + throw on illegal transition).
  - `deleteX(id)` → hard delete; comment explicitly if it's meant to be called only under a precondition the function itself doesn't enforce (and prefer enforcing it in `firestore.rules`, not just a comment — see A9).
- **IDs for array elements** (activity entries, notes, follow-ups, etc.): **always `crypto.randomUUID()`**. Never `Date.now().toString()` — it collides for same-millisecond writes (see Anti-Pattern A12).
- **Role checks**: always `hasPermission(role, "permission:string")` or the resolved-role helpers (`isRootAdmin(role)`, `resolveRole(role)`). Never `role === "CFO"` or a hardcoded `Set` of role-name strings (see Anti-Pattern A4).

---

## 4. Data-mutation rules (read before writing any Firestore call)

1. **Every mutation goes through a `<domain>-service.ts` function.** Page components call service functions; they do not call `addDoc`/`updateDoc`/`setDoc` directly, with the sole standing exception of the few rules-mismatch cases already flagged in the audit (e.g. `CreateReviewModal`'s direct `performance_reviews` write) — those are technical debt to fix, not a pattern to extend.
2. **One canonical function per business operation, ever.** If you're about to write a second function that creates/approves/rejects/marks-paid the same kind of entity, or a second place that builds the same kind of journal entry — stop. Extend the existing function. (This is the single most common deviation found in the audit — see §5.)
3. **If a workflow touches 2+ collections to represent one business event** (e.g. lead → client conversion, PO → journal entry), either:
   - Use a Firestore transaction/batch so it's atomic, or
   - If that's not feasible, explicitly handle the partial-failure case (don't assume the second write always succeeds just because the first did).
4. **Whenever you change which fields a mutation writes, check `firestore.rules` in the same commit.** Several confirmed bugs in this codebase are exactly this: a service function's field set drifted away from a rule's `diff(...).affectedKeys().hasOnly([...])` allowlist, silently breaking a self-service write path. Treat the rule's allowlist and the function's `update`/`set` payload as one unit that must change together.
5. **Whenever you add a new collection (including internal ones like counters), add an explicit `firestore.rules` block for it.** Do not let it fall through to the catch-all — that's Root-Admin-only and will silently break the feature for every other role.
6. **Audit logging belongs inside the service function for any auditable action, not the calling page.** If a page is responsible for remembering to call `logAuditEvent()` after a status change, it will eventually forget for one of the N pages that touch that resource. Put it in the one place that mutation always goes through.
7. **Don't recompute a financial or business aggregate ad hoc in a page component** (revenue, VAT collected, payroll totals, compliance rate) if a canonical function already computes it, or could. One formula, one place, imported everywhere it's displayed.
8. **Never ship a debug/test API route with no auth check.** If you need one during development, delete it before merging, or gate it behind an explicit env flag that defaults off.

---

## 5. ANTI-PATTERNS — confirmed during the audit, do not repeat

Each entry: what was found, why it's wrong, what to do instead. File references point at the original instance — they are examples of the pattern to avoid, not necessarily fixed yet.

### A1 — Two parallel implementations of the same entity's CRUD/state machine
**Found**: `expense-service.ts` (canonical, enforces `EXPENSE_TRANSITIONS`) vs. `accounting/expenses.ts` (a second `createExpense`/`approveExpense`/`rejectExpense` with zero state-machine guard).
**Don't**: write a second service file for an entity that already has one, even "just for the accounting side."
**Do**: add the missing capability to the existing service file. If accounting needs something HR/Finance services don't expose, export a new function from the *same* file.

### A2 — Hand-building a journal entry inline in a UI component
**Found**: the WHT journal entry (`2010`/`2200`/`1010`) is hand-written identically in both `finance/invoices/[id]/page.tsx` and `tax/wht/page.tsx`, instead of through `accounting/auto-journal.ts` (which has a dedicated `create*JournalEntry` function for every *other* transaction type).
**Don't**: build `JournalLineItem[]` arrays in a page component.
**Do**: add a `createWHTJournalEntry` (or equivalent) function to `auto-journal.ts` for any new transaction type that touches the ledger, mirroring the existing five.

### A3 — A second function that updates the same field, used instead of the "canonical" one
**Found**: `finance-service.ts` exports `markInvoiceSent`, but the actual send route (`api/invoices/[id]/send/route.ts`) does its own inline Admin-SDK update instead.
**Don't**: leave an exported service function unused while a route/page re-implements the same write.
**Do**: either call the existing function, or delete it if the route's version is now canonical — don't let both exist.

### A4 — Authorization checks that bypass `hasPermission()`
**Found**: hardcoded `Set(["HR","CEO","Root Admin","System Admin"])` in three API routes; raw `role === "CFO"` in `payroll/page.tsx`; raw `role !== ROLES.ROOT_ADMIN` (no `resolveRole()`) in `migrate-employee-numbers/route.ts`. Confirmed by testing: a user stored with a legacy alias role string (e.g. `"Root"`) is incorrectly denied by these, even though `hasPermission()`/`resolveRole()` would treat them identically to the canonical role.
**Don't**: compare `profile.role` to a literal string, and don't hardcode a `Set`/array of role names anywhere new.
**Do**: always gate on `hasPermission(role, "permission:string")`. If you need an OR of several roles, define the permission token in `roles.ts` and check that, not the role names.

### A5 — A UI gate broader (or narrower) than the matching `firestore.rules` clause
**Found, repeatedly, across every module audited**: CFO sees an asset action button rules reject; IT Manager has rules-level write access to `knowledge_base`/`change_log`/`oncall_schedule` that three separate UI pages never expose; Executive Assistant sees a "Create Review" button rules will always reject; a ticket's own assignee is shown a self-service status control the rules' field-allowlist actually rejects.
**Don't**: write (or copy-paste) a UI permission check independently of the matching Firestore rule.
**Do**: when you write or change a rule for a collection, grep the codebase for every UI gate referencing that collection's actions in the same change. Treat the rule as the source of truth; the UI gate should be derivable from it, ideally via the same `hasPermission()` token (A4) rather than a hand-rolled boolean expression per page.

### A6 — A workflow that spans collections with disjoint role permissions
**Found**: `payroll_runs` create/update requires `canManageHR() || isSystemAdmin()` (CFO excluded entirely); posting the resulting journal entry requires `canManageFinance() || isSalesRep()` (HR excluded entirely). Net effect: only Root Admin/System Admin can run payroll end-to-end to a posted journal entry — confirmed by test, not assumed.
**Don't**: design a multi-step workflow's rules clause-by-clause without checking whether any *single* intended role actually satisfies every step.
**Do**: when a feature's persona table says "X owns this workflow," verify X passes every rule the workflow's full happy path touches — not just the first write.

### A7 — Two incompatible data models for one business concept
**Found**: CRM-embedded `ClientSubscription[]` (`status: SubStatus` enum) vs. the top-level `subscriptions` collection (`cancelled: boolean`) — confirmed the client portal reads only the latter, so anything added via the former is structurally invisible to the client.
**Don't**: add a second collection/embedded-array schema for a concept that already has one elsewhere, even if it's "just for this one screen."
**Do**: extend the existing model. If the existing model genuinely doesn't fit, migrate it — don't fork it.

### A8 — Duplicated "find this record" logic with different precision
**Found**: `clients/[id]/page.tsx` matches a client's invoices/tickets by fuzzy substring on company name; `client-portal-service.ts` matches by exact normalized name/ID. Confirmed they disagree on near-miss company-name spellings.
**Don't**: re-implement a lookup/matching query ad hoc in a page component when a service function already implements the canonical version.
**Do**: import and call the existing service function. If its matching logic is too strict/loose for a new use case, fix it there — once — rather than writing a second, looser version next to it.

### A9 — A function whose safety comment isn't backed by an enforced check
**Found**: `deleteInvoice`'s comment says "call only for unpaid invoices after UI/auth checks," but the function itself has no such guard (it happens to be safe in practice only because `firestore.rules` independently blocks deleting a paid invoice — confirmed by test).
**Don't**: rely on a comment to express a precondition a future caller could easily violate.
**Do**: enforce the precondition in `firestore.rules` (preferred, since it's the actual security boundary) and/or in the function itself. Never comment-only.

### A10 — A declared type value with no producer
**Found**: `ProjectActivity.type` declares `"task_done"` and `"member_added"`; confirmed by test that no code path ever produces either — `updateTasks` only ever writes `tasks`/`progress`/`updatedAt`, never an activity entry.
**Don't**: add a literal to a discriminated union "for completeness" or "for later" without also writing the code that produces it in the same change.
**Do**: either implement the producer immediately, or don't add the literal yet.

### A11 — Mixing whole-array overwrite with `arrayUnion`/`arrayRemove` on the same document
**Found**: `projects-service.ts` uses whole-array overwrite for `updateTasks`/`updateMilestones`, but `arrayUnion`/`arrayRemove` for `activity`/`files` — on the *same* `projects` document. Confirmed by test: two concurrent task-array writes based on the same stale read silently clobber each other (one writer's update is lost, no error, no merge).
**Don't**: introduce whole-array overwrite for a field on a document that already uses atomic array ops for other fields, or vice versa, without deciding deliberately.
**Do**: for any field that multiple users/sessions might edit concurrently, default to `arrayUnion`/`arrayRemove` (or restructure to a subcollection) — not a full-array read-modify-write.

### A12 — `Date.now().toString()` as an ID inside an array
**Found**: used throughout `projects-service.ts`/`tickets-service.ts` for activity/note IDs, inconsistently alongside `crypto.randomUUID()` used elsewhere in the same arrays (e.g. `projects/new/page.tsx`). Confirmed two same-millisecond calls produce identical IDs.
**Don't**: use `Date.now().toString()` for any ID that doubles as a React key or a dedupe identity.
**Do**: always `crypto.randomUUID()` (see §3).

### A13 — A second notification-writing path that doesn't dispatch externally
**Found**: `notifications-service.ts createNotification`/`notifyAssignment` (and every domain wrapper built on it) only ever writes a Firestore doc — confirmed by test it has zero dependency on `push-service.ts`/`email-service.ts`. The *only* path that actually dispatches FCM push + Resend email is `api/notifications/send/route.ts`, used solely by tax-cron and email-campaigns.
**Don't**: call `createNotification`/`notifyAssignment` and assume the recipient gets pushed or emailed — they will only see an in-app bell icon.
**Do**: if a notification is meant to actually reach someone outside the app, route it through the same dispatching path `api/notifications/send` uses (or refactor that dispatch logic into a shared function `createNotification` itself can call — pick one and do it once, not per call site).

### A14 — An API route that reports success despite a sub-operation failing
**Found**: `api/notifications/send/route.ts` catches push/email failures with `.catch((e) => console.error(...))` and still returns `{ success: true }`. Confirmed by test: with no email provider configured, the route returns 200/`success:true` while delivery is structurally impossible.
**Don't**: swallow a sub-operation's failure into a console log while reporting overall success to the caller.
**Do**: decide deliberately — either fail the whole request, or return a response shape that distinguishes "notification recorded" from "push sent" / "email sent" so the caller (and any UI built on it) can tell the difference.

### A15 — A hardcoded/generic value where a specific enum exists
**Found**: every tax-deadline reminder and the email-campaign send hardcode `type: "renewal_due"`, ignoring the 19-value `NotificationType` enum in `types/notifications.ts`.
**Don't**: copy-paste a `type: "..."` literal from an unrelated call site "because it's close enough."
**Do**: use (or add, if missing) the semantically correct enum value for the actual event.

### A16 — Permission tokens declared but never checked
**Found**: `roles.ts` declares `manage:disciplinary` for CEO; no code path anywhere checks for it — disciplinary access is gated by a literal `isCEO()`/`role === "CEO"` check instead, which currently happens to produce the same result by coincidence.
**Don't**: add a permission string to `ROLE_PERMISSIONS` without also using it in the corresponding gate (UI and/or rules).
**Do**: when you declare a new permission, grep for where it should be consulted and use it there — or don't declare it.

### A17 — A second account-creation path with no Auth-account counterpart
**Found**: `auth-service.ts createUserProfile` writes a `users/{uid}` Firestore doc with no corresponding Firebase Auth account created anywhere in the function — and (confirmed by test) `firestore.rules`' `users` create rule is strictly self-uid-only, so this function doesn't even work for its stated purpose ("called by an admin to bootstrap a new staff member") for any role except Root Admin.
**Don't**: add a third way to provision a user identity. There are exactly two legitimate paths: self-signup (`auth-service.signUp`) and admin-provisioning (`api/admin/users/create`). Both create the Auth account and the Firestore profile together, atomically from the caller's perspective.
**Do**: if you need a new provisioning flow, extend `api/admin/users/create`, don't add a third standalone function.

---

## 6. Testing conventions (established this session — follow for new domains)

- Tests live under `tests/<domain>/*.test.ts`, run via `npm run test:emulator` (spins up the real Firestore + Auth emulators, runs Vitest, tears down — see `scripts/run-emulator-tests.mjs`).
- **Test against the real `firestore.rules`, not mocks.** Use `tests/helpers/emulator.ts`: `signInAs(role)` for a real authenticated test user, `seedDoc()`/`seedUserRole()` to bypass rules for fixture setup only, `readDocAsAdmin()`/`queryAsAdmin()` for rules-bypassing assertions.
- **Admin-SDK-backed API routes** (anything using `getAdminAuth()`/`getAdminDb()`) need `tests/helpers/admin-emulator.ts` imported first — it sets the emulator env vars the Admin SDK auto-detects. No real GCP credentials are needed or used.
- **Assert on `error.code === "permission-denied"`, not `error.message` regex.** Firestore formats `list` (query) rejections differently from single-document rejections; only `.code` is consistent across both.
- **Every invariant test should describe what's *expected*, then state what's *actual*, in comments** — this audit's test suites follow that pattern deliberately so a failing test reads as a finding, not a mystery.
- If a test fails, determine whether the bug is in the **test fixture/harness** or the **application code** before changing anything (see the test-results docs in `docs/prd/` for worked examples of both kinds, including ones that flip an original PRD assumption — e.g. the `deleteInvoice` case where the rules layer turned out to already protect against the originally-assumed deviation).

---

## 7. Where to look first

- `docs/REVERSE_ENGINEERING_INVENTORY.md` — full module-by-module map of every mutation path, with file:line references.
- `docs/prd/<domain>.md` — PRD + architecture + the full deviation list (D1, D2, ...) for each domain, with invariants stated as concrete business rules, not "it should work."
- `docs/prd/<domain>-test-results.md` — which of those deviations are confirmed by an actual emulator-backed test, plus any new findings or corrections discovered while testing.
