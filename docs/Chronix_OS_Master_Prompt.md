# CHRONIX OS — MASTER BUILD PROMPT (REVISION — MATCHES REPO)

**Purpose:** Single specification aligned with the **chronix-os** codebase (`src/`, `firestore.rules`, `package.json`).  
Use this when onboarding tools or developers. Older prompts that mention “9 roles”, Next.js 14-only, or a `root_admins` Firestore collection are **obsolete**.

---

## PROJECT OVERVIEW

**Chronix OS** is a cloud internal ERP for **Chronix Technology Limited**, an MSP (Lekki Phase 1, Lagos, Nigeria).  
Stack: **Next.js App Router**, **TypeScript**, **Tailwind**, **Firebase Auth + Firestore**, deployed on **Vercel**.

---

## COMPANY INFORMATION

Canonical constants live in `src/types/finance.ts` (`COMPANY`, `VAT_RATE`).

| Field | Value |
|--------|--------|
| Legal name | Chronix Technology Limited |
| Brand | Chronix Tech / CHRONIX |
| Tagline | Innovating beyond time |
| Address | No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos. |
| Email | Info@chronixtechnology.com |
| Phone | +234 91 2664 3718 |
| Website | www.chronixtechnology.com |
| Bank | Fidelity Bank — Account **5601601109** — TIN **33646874-0001** |
| Currency | Nigerian Naira (₦) |
| VAT | **7.5%** (`VAT_RATE = 0.075`), applied on invoices |
| Invoice number pattern | **`CT` + `YYMMDD`** via `generateInvoiceNumber()` (e.g. `CT260509` for 9 May 2026) |

---

## TECH STACK (AS INSTALLED)

| Layer | Package / version |
|--------|-------------------|
| Framework | **Next.js ^16.2.4** (App Router) |
| UI | React 18, **Tailwind CSS 3.4** |
| Forms / validation | **react-hook-form**, **zod**, **@hookform/resolvers** |
| Auth / DB | **firebase** ^10, **firebase-admin** ^13 |
| Styling helpers | **clsx**, **tailwind-merge** |
| Email (optional) | **resend** |
| Icons | **Inline SVG components** (no `@heroicons/react` dependency) |
| Lint / types | ESLint 9 + **eslint-config-next**, TypeScript 5 |

**Scripts:** `dev` / `build` / `typecheck` run Node with increased heap (`--max-old-space-size`). Use `npm run verify` for env check + typecheck + strict lint + build.

---

## BRAND & DESIGN SYSTEM

unchanged intent from the original prompt:

- **Primary dark:** `#003366` — maps to Tailwind tokens such as `primary-dark`
- **Accent:** `#FF761B`
- **Secondary:** `#2472B4`
- **Typography:** **Orbitron** (headings / wordmark), **Helvetica / system sans** (body)
- **Sidebar:** dark charcoal-style surface; active nav uses accent styling
- **Cards:** rounded corners, enterprise spacing

---

## RBAC — ROLES & ACCESS (SOURCE: `src/types/roles.ts`)

### Canonical roles (**13**)

| # | Role | Default redirect (`ROLE_REDIRECTS`) | Notes |
|---|------|-----------------------------------|--------|
| 1 | **Root Admin** | `/dashboard` | **Break-glass:** `hasPermission()` returns true for every permission; Firestore `isRootAdmin()` + catch-all rule for full DB access when authenticated. Aliases: `Chronix Root`, `Root`. |
| 2 | **CEO** | `/dashboard` | **`view:all`** expands to **all `view:*`** checks only — **not** automatic `manage:*`. Explicit extras include approvals and `manage:disciplinary`. |
| 3 | **CFO** | `/dashboard/finance` | Finance, tax manage, subscriptions manage, tickets manage, procurement view, expenses, approvals. |
| 4 | **System Admin** | `/dashboard` | Broad **`manage:*`** across staff, settings, HR, tickets, CRM, projects, procurement, subscriptions, assets, knowledge, incidents, changes, on-call; **`view:finance`** / **`manage:finance`** (contrary to older docs that said “no finance”). |
| 5 | **Brand Lead** | `/dashboard/crm` | CRM manage, brand, projects, campaigns / content / email_marketing. |
| 6 | **Social Media Lead** | `/dashboard/crm` | Social + brand view, CRM manage, campaigns + content. |
| 7 | **HR** | `/dashboard/hr` | HR manage, leave & disciplinary manage, tax/PAYE view. |
| 8 | **Staff** | `/dashboard` | Tickets/projects/CRM/HR **view**, **manage:time**, knowledge view, submit leave/expenses **in permissions**; sidebar adds Time + Knowledge (see below). |
| 9 | **Client** | `/portal` | Portal-only (`view:portal`). |
| 10 | **Sales Rep** | `/dashboard` | CRM manage, finance **view**, **create:invoices**, subscriptions view, expenses. |
| 11 | **Project Manager** | `/dashboard` | Projects + tickets manage, CRM view, time view/manage, analytics. |
| 12 | **Finance Officer** | `/dashboard/finance` | Finance manage, tax view, procurement/subscriptions view, **create:invoices**. |
| 13 | **IT Manager** | `/dashboard` | Tickets manage, assets manage, knowledge manage, incidents/changes/on-call manage, projects/subscriptions view. |

### Legacy aliases (stored role strings → canonical)

Defined in **`ROLE_ALIASES`**: e.g. `Admin` / `Super Admin` → System Admin, `Manager` → CEO, `Finance` / `Accountant` → CFO, `Support` / `Employee` / `User` → Staff. Unknown strings resolve to **Staff** (`resolveRole`).

### Permission helper

- **`hasPermission(rawRole, permission)`** — uses `resolveRole`; Root Admin always true; `view:all` grants any `view:*` key only.

---

## SIDEBAR NAVIGATION PER ROLE (SOURCE: `src/components/Sidebar.tsx`)

Labels below match **`ALL_NAV`** entry names. Root Admin receives **every** href.

| Role | Visible routes (href prefixes) |
|------|----------------------------------|
| **Root Admin** | All: Dashboard, Staff, Finance, Tax, Tickets, CRM, Projects, Vendors, HR, Assets, Time, Subscriptions, Knowledge, Incidents, Changes, On-Call, Brand, Analytics, Audit Log, Notifications, Settings |
| **CEO** | Dashboard, CRM, Finance, Tax, Tickets, Projects, Vendors, HR, Assets, Subscriptions, Analytics, Knowledge, Incidents, Changes, Audit, Notifications, Settings |
| **CFO** | Dashboard, Finance, Tax, Vendors, Subscriptions, Analytics, Notifications |
| **System Admin** | Dashboard, Staff, Tickets, Projects, Vendors, Subscriptions, HR, Assets, Time, Tax, Knowledge, Incidents, Changes, On-Call, Audit, Settings, Notifications |
| **Brand Lead** | Dashboard, CRM, Analytics, Brand, Notifications |
| **Social Media Lead** | Dashboard, CRM, Brand, Notifications |
| **HR** | Dashboard, HR, Tax, Notifications |
| **Staff** | Dashboard, Tickets, Projects, Time, Knowledge, Notifications |
| **Sales Rep** | Dashboard, CRM, Finance, Subscriptions, Notifications |
| **Project Manager** | Dashboard, Projects, Tickets, Time, CRM, Knowledge, Analytics, Notifications |
| **Finance Officer** | Dashboard, Finance, Tax, Vendors, Subscriptions, Notifications |
| **IT Manager** | Dashboard, Tickets, Assets, Time, Knowledge, Incidents, Changes, On-Call, Projects, Subscriptions, Analytics, Notifications |

Extra **`ROLE_NAV`** keys for raw legacy strings: **`Admin`**, **`Manager`**, **`Finance`**.

**Client** uses **`/portal`** tree — not this internal sidebar.

---

## ACCOUNTING SYSTEM (`src/lib/accounting/`)

A full **double-entry accounting engine** is implemented in `src/lib/accounting/`. All journal entries are **immutable** — Firestore rules enforce `allow update: if false` on `journal_entries`.

### Collections added

| Collection | Purpose |
|---|---|
| `chart_of_accounts` | 35 accounts (assets, liabilities, equity, revenue, expenses). Readable by all authenticated users. |
| `journal_entries` | Immutable double-entry records. Finance team creates; **no one can update or delete** — corrections must be voiding entries. |
| `vat_returns` | Monthly VAT return records (Output VAT − Input VAT = Net payable to FIRS). |
| `metadata` | Sequential counters for journal entry numbers (`JE260514-001`) and expense numbers (`EXP260514-001`). Finance + Sales Rep can read/write via `runTransaction`. |

### Auto-journal wiring (`auto-journal.ts`)

| Trigger | Debit | Credit |
|---|---|---|
| Invoice created | 1100 Accounts Receivable (full total) | 40XX Revenue per item (each `item.lineTotal` → correct revenue account) + 2100 VAT Payable |
| Payment received | 1010 Cash in Bank | 1100 Accounts Receivable |

Revenue account lookup (`revenueAccount()`) maps item names to accounts 4010–4050 by keyword. Each invoice item gets its **own** credit line with the correct revenue account code — not one line for the whole subtotal.

### Financial report pages

| Route | Report |
|---|---|
| `/dashboard/finance/reports/profit-loss` | P&L Statement (revenue − expenses by date range) |
| `/dashboard/finance/reports/balance-sheet` | Balance Sheet (assets = liabilities + equity) |
| `/dashboard/finance/reports/vat-return` | VAT Return (FIRS-compliant, output vs input VAT) |
| `/dashboard/finance/reports/journal-entries` | Journal entry ledger with search/filter |

### Chart of Accounts (key codes)

| Code | Account |
|---|---|
| 1010 | Cash in Bank — Fidelity |
| 1100 | Accounts Receivable |
| 2100 | VAT Payable (7.5%) |
| 4010 | IT Consulting Services Revenue |
| 4020 | Network Infrastructure Revenue |
| 4030 | Hardware Sales Revenue |
| 4040 | Branding & Design Revenue |
| 4050 | Software Development Revenue |

---

## FIREBASE SETUP

### User profile (`users/{uid}`)

Type **`ChronixUser`** includes at minimum: `uid`, `email`, `displayName`, **`role`**, `createdAt`, `lastLoginAt`, optional `department`, `photoURL`.  
Role-based redirects use **`ROLE_REDIRECTS`** after login.

### Root Admin storage (**as implemented**)

- **No separate `root_admins` collection is required by Firestore rules.**  
- Root access is determined by **`role`** on the user document: `Root Admin`, `Chronix Root`, or `Root` (see `isRootAdmin()` in `firestore.rules`).
- **Provisioning:** internal accounts use **`/login` → Create account** (when enabled), **`POST /api/admin/users/create`** (HR / System Admin / Root Admin / Staff-as-Staff), or Firebase Console. Promoting a user to Root Admin is done by updating **`users/{uid}.role`** in Firestore (controlled process).

### Protected UI

- **`ProtectedRoute`** (`src/components/ProtectedRoute.tsx`): waits for auth + profile; uses **`hasPermission`** / optional **`allowedRoles`** (exact `profile.role` match for allowedRoles — prefer canonical role strings).
- **Firestore rules** are authoritative for read/write.

### Firestore collections (**match `/firestore.rules`**)

Core ERP:

`users`, `invoices`, `payments`, `expenses`, `tickets`, `leads`, `clients`, `projects`, `vendors`, `purchase_orders`, `employees`, `payroll_runs`, `subscriptions`, `notifications`

Accounting:

`chart_of_accounts`, `journal_entries` (**immutable** — no update/delete), `vat_returns`, `metadata`

Tax:

`tax_rules`, `vat_records`, `withholding_tax`, `payroll_tax`, `tax_reports`

HR / ops extensions:

`leave_requests`, `disciplinary_records`, `time_entries`, `audit_logs`, `knowledge_base`, `change_log`, `incidents`, `oncall_schedule`

Brand / marketing:

`brand_assets`, `content_posts`, `campaigns`, `email_campaigns`

Assets:

`assets`

**Note:** There is **no** top-level `tasks` collection in rules — tasks are modeled **inside** `projects` documents in the app. There is **no** `tax_transactions` collection name in rules (use **`vat_records`** / related tax collections).

---

## MODULE MAP (HIGH LEVEL — ROUTES UNDER `/dashboard`)

| Area | Route prefix | Implementation notes |
|------|----------------|----------------------|
| Auth | `/login` | Form uses POST-style submission; middleware-style helpers may strip `email`/`password` query params (`src/proxy.ts` when integrated). |
| Finance | `/dashboard/finance` | Tabs in layout: Overview, Invoices, Payments. Expenses under `/dashboard/finance/expenses`. |
| Financial Reports | `/dashboard/finance/reports` | Sub-pages: `profit-loss`, `balance-sheet`, `vat-return`, `journal-entries`. |
| Tickets | `/dashboard/tickets` | List, new, detail; SLA concepts in UI/services. |
| CRM | `/dashboard/crm` | Leads, clients, follow-ups, pipeline-style views. |
| Projects | `/dashboard/projects` | Tasks embedded on projects. |
| Procurement | `/dashboard/procurement` | Vendors, POs. |
| HR | `/dashboard/hr` | Employees, payroll, performance, leave, disciplinary (layout tabs vary by permission). |
| Subscriptions | `/dashboard/subscriptions` | Expiry-focused subscription tracking. |
| Tax | `/dashboard/tax` | VAT, WHT, PAYE, layouts gated by tax permissions. |
| Analytics | `/dashboard/analytics` | Tabbed dashboards; role-filtered. |
| Notifications | `/dashboard/notifications` | In-app feed + `src/lib/notifications-service.ts` helpers (overdue invoices, subscription expiry, tax reminders, etc.). |
| Assets / Time / Knowledge / Incidents / Changes / On-call / Brand / Audit / Settings | Matching `/dashboard/...` routes | See Sidebar list. |
| Staff directory | `/dashboard/staff` | Internal user listing (where permitted). |
| Client portal | **`/portal`**, `/portal/login` | Separate route tree from dashboard. |

---

## RBAC FIXES APPLIED (May 2026)

Two inconsistencies between `ROLE_PERMISSIONS` (app layer) and `firestore.rules` (database layer) were corrected:

1. **Sales Rep — CRM write access**: `canManageCRM()` in Firestore rules now includes `isSalesRep()`. Previously Sales Reps had `manage:crm` in `ROLE_PERMISSIONS` but Firestore would block their writes to `leads` and `clients`.
2. **System Admin — `manage:finance`**: Added `"manage:finance"` to `ROLE_PERMISSIONS[SYSTEM_ADMIN]`. Previously System Admin was in Firestore's `canManageFinance()` but `hasPermission(role, 'manage:finance')` would return false for them.

---

## ACCESS CORRECTIONS (VS OLDER PROMPT TEXT)

1. **Role count:** **13** canonical roles — not 9. Add Sales Rep, Project Manager, Finance Officer, IT Manager; **Root Admin** is first-class.
2. **CEO:** Executive **read** breadth via `view:all` + explicit permissions — **not** full operational “manage everything”.
3. **System Admin:** Has **finance** and **CRM** manage capabilities in `ROLE_PERMISSIONS` — do **not** document as “finance: none”.
4. **Staff:** Sidebar includes **Time** and **Knowledge**, not only tickets/projects. Permissions include **`view:crm`** but CRM is **not** in Staff sidebar (reachable only by URL if needed). **`submit:expenses`** exists on the role, but **`/dashboard/finance`** layout requires **`view:finance`** — Staff **cannot** open finance shell without a route/layout adjustment (known product gap if expense UX for Staff is required).
5. **CRM “assigned only” for Staff:** Firestore **`hasViewCrm()`** includes Staff-like roles — aggregate reads may be broader than “assigned only”; product intent should stay enforced in UI queries where needed.
6. **Tech icons:** Document **inline SVG**, not `@heroicons/react`.

---

## ROOT ADMIN GOVERNANCE (**IMPLEMENTED VS POLICY**)

**Implemented in code/rules:**

- Role + aliases; `hasPermission` bypass; Firestore `isRootAdmin()` woven through helpers; the recursive `/{document=**}` rule grants Root Admin read/write on any path.
- Sensitive API: user delete route allows **System Admin** and **Root Admin**.
- Policy artifact: `docs/root-admin-governance-policy.html` / `.pdf`.

**Not implemented as described in older prompts (treat as roadmap unless built):**

- Dedicated **`/admin/root-provisioning`** UI with secondary approval codes  
- **`root_admins`** collection  
- Mandatory MFA, 2-hour idle timeout, device step-up (Firebase console / custom claims — not in repo as enforced policy)  
- **Impersonation** mode with banner + audit linkage  
- **`/dashboard/root`** emergency dashboard  
- **Emergency revoke** API hook  
- Automated quarterly review notifications  

---

## ROLE-SPECIFIC DASHBOARDS (SOURCE: `src/app/(dashboard)/dashboard/page.tsx`)

Composite dashboards render by **`resolveRole(profile.role)`**:

| Canonical role | Component |
|----------------|-----------|
| CEO | `CEODashboard` |
| CFO | `CFODashboard` |
| Root Admin, System Admin | `AdminDashboard` |
| Brand Lead, Social Media Lead | `BrandLeadDashboard` |
| HR | `HRDashboard` |
| Staff | `StaffDashboard` — KPIs: assigned tickets, project tasks, profile link, quick actions |
| Sales Rep | `SalesRepDashboard` |
| Project Manager | `ProjectManagerDashboard` |
| Finance Officer | `FinanceOfficerDashboard` |
| IT Manager | `ITManagerDashboard` |

---

## SECURITY & QUALITY BAR

- Firebase web config: **`NEXT_PUBLIC_FIREBASE_*`**; Admin SDK: **`FIREBASE_ADMIN_*`** server-side.
- **Firestore rules** must mirror permission intent (`src/types/roles.ts` + `firestore.rules`).
- **UI:** never blank loading — `ProtectedRoute` shows branded loaders and `/unauthorized` only after profile resolves.
- **Automations:** Notification helpers exist in `src/lib/notifications-service.ts`; wiring may be client-triggered (dashboard/subscription flows) — verify Cloud Scheduler / Functions separately if full background automation is required.

---

## BUILD INSTRUCTIONS

1. Copy env template → `.env.local` (Firebase keys). Mirror secrets on Vercel.
2. `npm install`
3. `npm run verify` before release (or at minimum `npm run typecheck` + `npm run build`).
4. Deploy Firestore rules from `firestore.rules` to Firebase Console.

---

## DOCUMENT HISTORY

| Version | Change |
|---------|--------|
| Original | 9-role prompt, Next 14, heroicons, `root_admins`, incompatible finance/RBAC statements |
| **This revision** | Aligned to **chronix-os** codebase: Next 16, 13 roles, Sidebar matrix, Firestore collections, Root Admin reality split |
