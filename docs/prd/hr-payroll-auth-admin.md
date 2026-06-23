# HR/Payroll & Auth/Admin/Staff — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md) §B.
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

This module is two tightly coupled things: **(a)** the identity/access layer — who can log in, what they're allowed to do, how accounts are created and removed — and **(b)** the HR system of record — employee data, payroll runs, leave, performance reviews, and disciplinary records, all of which live as fields merged onto the *same* `users/{uid}` document that Auth/Admin manages. There is no separate "employee" entity independent of "user account" in the current data model.

### 1.2 Personas / roles

| Role | What they're meant to do here |
|---|---|
| **Root Admin** | Unrestricted — only role that may assign/revoke Root Admin itself, delete accounts, manage staff. |
| **System Admin** | Full `manage:staff`/`manage:settings`/`manage:hr` — can provision/delete accounts, fix roles. |
| **HR** | `manage:hr`, `view:paye` — owns employee records, payroll, leave, disciplinary day-to-day. |
| **CFO** | Views payroll (`payroll_runs` read), participates in disciplinary access per rules/UI, but is *not* in the payslip API's manager set (see Deviation). |
| **CEO** | Executive view + override: can read/write `performance_reviews` and `disciplinary_records` directly (literal role check, not a permission token), `approve:invoices/expenses`. |
| **Staff** | Self-service: `submit:leave`, `view:own`, can register their own account via self-signup (always lands as `Staff`). |
| **Any employee** | Views/downloads their own payslip, submits leave, sees their own performance notes. |

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **One account, one identity, one provisioning record.** A Firebase Auth user and its Firestore `users/{uid}` profile must be created together, by one deliberate action, and must be deleted together. There must never be an Auth account with no profile, or a profile with no Auth account, reachable through normal use.
2. **Logging in must never create an account.** Authentication is read-only against existing identity; account creation is a distinct, explicit, audited action (self-signup or admin provisioning) — never a side-effect of a successful login. *(This invariant was established and fixed in a prior session — see the "Already-fixed" note below.)*
3. **Role-based access must be evaluated through one mechanism everywhere.** `hasPermission(role, "x")` is the system's stated authorization model (`roles.ts`). Every gate — UI buttons, page guards, and server-side API checks — must consult it, so that a legacy role alias (e.g. `"Finance"` → CFO) is honored identically everywhere. A gate that hardcodes a role-name string or a `Set` of role names is a second, divergent authorization model.
4. **A payroll run, once marked paid, must post exactly one journal entry reflecting the actual net/gross/deductions paid** — not a number independently recomputed by the page that triggered it.
5. **Suspending/deleting an employee must consistently affect every place that employee shows up** — payroll eligibility, login ability, HR roster counts — not just one field on one document while a parallel/legacy collection still thinks they're active.
6. **A leave or disciplinary action must be reviewable/actionable by exactly the roles the permission model says can act on it** — not a different, hand-picked role list per page.
7. **Every permission token declared in `roles.ts` (e.g. `manage:disciplinary`) must actually be consulted by some code path.** A permission that exists in the model but is checked nowhere is a sign the UI/rules drifted away from the model without anyone updating it.

> **Already-fixed note**: invariant #2 was found broken (login silently auto-provisioned a `Staff` profile for any authenticated-but-profile-less Firebase user) and was fixed earlier this session — `fetchUserProfile` is now read-only; only `signUp()` creates a profile. This PRD documents the *current* (fixed) state and flags what's still outstanding around it.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms / login)          SERVICE / API LAYER                         FIRESTORE / AUTH                         EXIT
─────────────────────────         ───────────────────                         ─────────────────                        ────
(auth)/login (Sign In)        →   auth-service.signIn                    →    Firebase Auth (verify) + users/{uid} (read-only)  →  dashboard (role-routed redirect)
(auth)/login (Create account) →   auth-service.signUp                    →    Firebase Auth (create) + users/{uid} (create)     →  dashboard (Staff)
(auth)/login (Forgot password)→   auth-service.sendReset                 →    Firebase Auth (reset email)                        →  email inbox

staff/page.tsx (role edit)    →   direct updateDoc (NOT a service)        →    users/{uid} (update role)                         →  Staff directory
staff/page.tsx (delete)       →   hr-service.deleteEmployee               →    DELETE /api/admin/users/[uid] (Admin SDK)          →  Auth + users + employees(legacy) all removed
(no UI — API only)            →   POST /api/admin/users/create            →    Firebase Auth (create) + users/{uid} (create)      →  new account ready to sign in

hr/new (link employee)        →   hr-service.createEmployee               →    users/{uid} (merge HR fields) + assignEmployeeNumber → counters/employeeNumber + users/{uid}
hr/[id] (suspend/activate)    →   hr-service.suspendEmployee/activateEmployee →  users/{uid} (status field)                       →  HR roster, payroll eligibility (manually re-derived)
hr/[id] (performance note)    →   hr-service.addPerformanceNote           →    users/{uid} (arrayUnion)                           →  performance page
hr/performance (review)       →   UI direct addDoc (NOT a service)        →    performance_reviews (create)                       →  performance detail page

hr/payroll (generate run)     →   hr-service.createPayrollRun             →    payroll_runs (create, PAYE/pension/NHF enriched)   →  payroll run detail
hr/payroll (mark paid)        →   hr-service.markEntryPaid / markAllPaid  →    payroll_runs (update) + on full completion:
                                                                                 auto-journal.createPayrollJournalEntry → journal_entries  →  Finance ledger (cross-module)

hr/leave (submit/review/cancel)→  leave-service.createLeaveRequest/reviewLeave/cancelLeave → leave_requests (create/update) + notifications →  leave dashboard, employee notification

hr/disciplinary (create/resolve)→ disciplinary-service.createDiscEntry/resolveDiscEntry/... → disciplinary_records (create/update)            →  disciplinary dashboard

payslip/* (view/download)     →   API: /api/payslip, /api/payslip/pdf, /api/payslip/pdf/bulk → reads users + payroll_runs (read-only)          →  PDF / on-screen payslip

api/admin/migrate-employee-numbers → server-side, Admin SDK               →    users/* (batch update) + counters/employeeNumber          →  one-time migration result
```

**Exit points**: role-routed dashboard redirect on login, the Staff directory, HR employee profile pages, payroll run/payslip views (on-screen and PDF), leave/disciplinary dashboards, and — cross-module — the Finance ledger (`journal_entries`) once a payroll run completes.

### 2.2 Mutation paths — and which ones do NOT share the same underlying logic

| Conceptual operation | Canonical path | Duplicate / divergent path(s) | Shared? |
|---|---|---|---|
| Provision a new account | `api/admin/users/create` (Auth + Firestore together, audited) | `auth-service.signUp` (self-service, separate code, always `Staff`) **and** `auth-service.createUserProfile` (Firestore-only, no Auth account — appears unused) | ⚠️ **Three independent paths, two with no shared logic** |
| Decide "is this employee record" | `hr-service.userDocHasHrEmployeeRecord` (heuristic: `bankName` present + `accountNumber` ≥10 digits) | `api/admin/migrate-employee-numbers/route.ts` re-implements the **identical heuristic inline** | ⚠️ **NOT shared — two copies of the same rule** |
| Gate "may manage HR/payroll/disciplinary" | `hasPermission(role, "manage:hr")` | `payroll/page.tsx`: `canManage \|\| role === "CFO"` (raw string); `disciplinary/page.tsx` & `disciplinary/new/page.tsx`: `isRootAdmin \|\| manage:hr \|\| role === "CEO"` (three-way mixed); API routes (`payslip/route.ts`, `payslip/pdf/route.ts`, `payslip/pdf/bulk/route.ts`, `performance/compute/route.ts`): hardcoded `Set(["HR","CEO","Root Admin","System Admin"])`; `migrate-employee-numbers/route.ts`: raw `role !== ROLES.ROOT_ADMIN` (no `resolveRole`) | ⚠️ **At least 4 divergent idioms, none calling `hasPermission` consistently** |
| Compute payroll totals (gross/deductions/net) | `hr-service.createPayrollRun` → `enrichEntriesWithPAYE` (the value actually persisted) | `payroll/page.tsx handleGenerate` independently pre-computes `totalGross`/`totalDeductions`/`totalNet` and passes them in, where they're overwritten/ignored by the service | ⚠️ **NOT shared — page's computation is dead work, not dead code** |
| "Employee record" identity | `users/{uid}` (current, live read/write target for all HR services) | `firestore.rules` + the delete route still reference a separate `/employees/{uid}` collection | ⚠️ **Two parallel notions of the same entity, one of them legacy** |
| Delete a user account | `api/admin/users/[uid]` DELETE (Auth + `users` + legacy `employees`, audited, rate-limited) | none found — single path | ✅ **Shared** |
| Create a journal entry from a payroll run | `auto-journal.createPayrollJournalEntry` → `journal-entries.createJournalEntry` | none found | ✅ **Shared** |

---

## PART 3 — DEVIATIONS (explicit — bugs against the invariants in §1.3)

### D1 — Invariant #1 violated: a third, orphaned account-creation path with no Auth counterpart
**File**: `src/lib/auth-service.ts:135-149` (`createUserProfile`)
Writes a `users/{uid}` Firestore document with no corresponding Firebase Auth account created anywhere in this function. No caller was found in the audited scope. If anything still calls this, it produces exactly the broken state invariant #1 forbids — a profile nothing can authenticate into. Even if unused today, its existence is a trap for a future caller.

### D2 — Invariant #3 violated: four divergent authorization idioms, several of which don't honor legacy role aliases
**Files**: `hr/payroll/page.tsx:27` (`role === "CFO"`), `hr/disciplinary/page.tsx:26-28` and `hr/disciplinary/new/page.tsx:28-30` (`role === "CEO"` mixed in), `api/payslip/route.ts:6`, `api/payslip/pdf/route.ts:12`, `api/payslip/pdf/bulk/route.ts:12`, `api/performance/compute/route.ts:4` (hardcoded `MANAGER_ROLES` Set), `api/admin/migrate-employee-numbers/route.ts:34` (raw role compare, no `resolveRole`).
`ROLE_ALIASES` in `roles.ts` (e.g. `"Finance"`/`"Accountant"` → CFO, `"Manager"` → CEO) is honored by `hasPermission()`/`resolveRole()` but **silently fails every one of the checks above** — a user stored with a legacy role string would be denied access these pages intend to grant them, with no error explaining why.

### D3 — Invariant #6 violated: three disagreeing definitions of "who is payroll/HR staff"
**Files**: `api/payslip/*` `MANAGER_ROLES` (no CFO) vs. `firestore.rules:354` `payroll_runs` read rule (`canManageHR() || isCFO() || isSystemAdmin()` — includes CFO, excludes CEO) vs. `hr/payroll/page.tsx:27` `canView` (includes CFO via string, excludes CEO).
Net effect: a CEO can pull a payslip via the API but cannot read `payroll_runs` directly; a CFO can read `payroll_runs` but isn't in the payslip API's manager set. These three surfaces should agree on one definition and currently don't.

### D4 — Invariant #4 violated: the page's payroll totals are computed and then silently discarded
**Files**: `hr/payroll/page.tsx:56-67` (`handleGenerate` computes `totalGross`/`totalDeductions`/`totalNet`) vs. `hr-service.ts:252-264` (`createPayrollRun` recomputes gross/net via `enrichEntriesWithPAYE` and only uses the page's `totalDeductions` as an *addend*, not the page's actual final figures).
The page's `totalNet` is computed **before** PAYE is applied (effectively `netPay == salary` at that point in the page's code), while the persisted figure is post-PAYE. There is no comment indicating this divergence is intentional; it reads as one layer not knowing the other already does the real computation.

### D5 — Invariant #5 violated: two parallel "employee record" entities, one no longer written
**Files**: `firestore.rules:350-354` (`/employees/{employeeId}` rule, still gated by `canManageHR()`) vs. `src/lib/hr-service.ts:48` (`EMP = "users"` — all HR reads/writes target `users`, not `employees`) vs. `api/admin/users/[uid]/route.ts:50,53` (delete route still deletes a legacy `employees/{uid}` doc "just in case").
Anything still reading the standalone `employees` collection (the Firestore rule implies something might) would see stale or absent data, since the live HR system stopped writing there.

### D6 — Invariant #7 violated: `manage:disciplinary` is a dead permission token
**File**: `roles.ts:69` declares `manage:disciplinary` for CEO. No code path in `disciplinary/page.tsx`, `disciplinary/new/page.tsx`, or `firestore.rules:456-461` ever checks for it — access is granted via a literal `role === "CEO"` string check instead. The permission model says one thing; the enforcement says another. They currently agree only because both independently special-case CEO.

### D7 — Invariant #3 violated (UI/rules mismatch, confirmed): Executive Assistant sees a button it cannot use
**Files**: `hr/performance/page.tsx:44-46` (`canCreate = manage:hr || view:all`) vs. `firestore.rules:369` (`performance_reviews` write: `canManageHR() || isCEO()` only).
Executive Assistant has `view:all` (by design — a read-only mirror role), so this UI gate shows them the "Create Review" button. Firestore will reject the write. This is a UI bug, not a security hole (the backend correctly denies it), but it's a broken affordance: the role gets a button that always fails.

### D8 — Invariant #6 violated (UI/rules mismatch, confirmed): leave cancel rule is stricter than it needs to be, in a way that's easy to silently break
**File**: `leave-service.ts:85-87` (`cancelLeave` writes only `{status:"cancelled"}`, no `updatedAt`) vs. `firestore.rules:444-451` (self-cancel update must have `affectedKeys().hasOnly(["status","updatedAt"])` and `resource.data.status == "pending"`).
This one currently *works* (a subset of allowed keys still satisfies `hasOnly`), but it is fragile: if anyone later adds a field to the cancel write without checking the rule, it breaks silently. Flagged because it's exactly the kind of rules/code coupling that has already broken elsewhere in this same domain (D7).

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Should **CEO** be a payroll-viewing role? Rules deny it, the payslip API grants it, the payroll page denies it. Someone needs to decide the actual intended access level for CEO over payroll data, not just pick whichever of the three current behaviors is "least broken."
- Is the **legacy `employees` collection** (D5) meant to be fully retired (drop the rule, drop the delete-route reference), or is there a migration still pending that the rule is waiting for?
- Should self-signup (`signUp`) continue to exist as a public-facing flow at all, given that admin provisioning (`api/admin/users/create`) is the more controlled path — or is self-signup intentionally kept for a specific onboarding scenario?
