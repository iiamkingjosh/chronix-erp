# Analytics & My Performance — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md),
> [`vendors-assets.md`](./vendors-assets.md), and [`incidents-audit-log.md`](./incidents-audit-log.md)
> (same format/depth).
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.
>
> Neither module has a dedicated Firestore collection of its own to investigate in isolation — both are pure read-side consumers of other modules' data, which is exactly why they're audited together here: the same "who can see this, and is it computed honestly" questions recur for both, just aimed at different sources.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

**Analytics** is a five-tab executive BI dashboard at `/dashboard/analytics` — Command Centre, Sales & Revenue, Service Delivery, Team Productivity, Client Retention — with the header text *"Real-time business intelligence and performance metrics"*. It has no collection of its own; every number is computed client-side from documents pulled out of six other modules' collections (`invoices`, `tickets`, `users`, `leads`, `clients`, `projects`, `subscriptions`).

**My Performance** is a single-page, read-only review viewer at `/dashboard/my-performance`, with the footer note *"Your reviews are managed by HR and are read-only."* It is **not** a self-computed productivity dashboard — it displays `performance_reviews` documents HR already created via the separate `hr/performance` feature (audited previously), filtered to the signed-in user's own `employeeId`.

### 1.2 Personas / roles

| Role | Analytics (`view:analytics`) | My Performance (`view:own`) | Sees own reviews? | Sees others' reviews? |
|---|---|---|---|---|
| Root Admin | Yes (wildcard) | Yes (wildcard) | Yes | Yes (separately, via `hr/performance`) |
| CEO | Yes | Yes (via `view:all`→`view:*` expansion) | Yes | Yes (via `hr/performance`) |
| CFO | Yes | Yes | Yes | No |
| System Admin | Yes | Yes | Yes | No |
| Brand Lead | Yes | Yes | Yes | No |
| Social Media Lead | Yes | Yes | Yes | No |
| HR | Yes | Yes | Yes | Yes (via `hr/performance`, `canManageHR()`) |
| Project Manager | Yes | Yes | Yes | No |
| IT Manager | Yes | Yes | Yes | No |
| Executive Assistant | Yes (via `view:all`) | Yes | Yes | Yes (via `hr/performance`, read-only) |
| Staff, Sales Rep, Finance Officer | **No** (lack `view:analytics`) | Yes | Yes | No |

`view:own` is granted to **every role in the system**, either explicitly or via the `view:all`→`view:*` expansion — there is no role that fails the My Performance gate. `view:analytics` is narrower (excludes Staff, Sales Rep, Finance Officer) but still 9 of 13 roles.

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **A metric's label must describe what it actually computes.** "Pipeline Value" must mean pipeline value, not a differently-sourced number that happens to occupy that card.
2. **A percentage computed from a small sample must not visually present with the same confidence as one computed from a large sample.** Coloring a KPI green at a fixed threshold regardless of N is misleading once N is small enough that the percentage is mostly noise.
3. **A role permitted to see a tab/page must actually be able to read every collection that page depends on, or the gap must be visible, not silently rendered as zero.** A swallowed per-collection rule rejection that surfaces as "0" is indistinguishable from genuine emptiness.
4. **"My X" must mean the signed-in user's own data, enforced at both the query and the rule layer** — not a page that happens to show personal-looking data with no actual scoping, and not a rule that's looser than the query that depends on it.
5. **An unbounded full-collection fetch used only to compute one aggregate number must have a ceiling**, or cost/latency grows forever as the company's data grows, with no code path that currently limits it.
6. **The same business concept computed in two different places (e.g. "Active Clients," "per-employee productivity") must either share one implementation or have a clearly different, separately-labeled meaning** — not two independently-coded versions of the same label that can silently drift apart.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY                          AGGREGATION LAYER                       SOURCE COLLECTIONS (all unbounded fetches)         EXIT
─────                          ─────────────────                       ───────────────────────────────────────            ────
analytics/page.tsx        →    analytics-service.getMasterDashboard →  invoices, tickets, clients, projects,         →    Command Centre KPIs
                                  (60s cache, "master" key)                subscriptions, users — 6 in parallel
analytics/sales/page.tsx  →    analytics-service.getSalesAnalytics  →  invoices, leads (re-fetched independently,    →    Sales & Revenue
                                  (60s cache, "sales" key)                no cross-page collection cache reuse)
analytics/service/page.tsx→    analytics-service.getServiceAnalytics → tickets (re-fetched independently)            →    Service Delivery
analytics/team/page.tsx   →    analytics-service.getTeamAnalytics   →  tickets, projects (re-fetched independently)  →    Team Productivity
analytics/retention/page.tsx → analytics-service.getRetentionAnalytics → clients, invoices, leads (re-fetched)       →    Client Retention

hr/performance (CreateReviewModal) → /api/performance/compute (Admin SDK, →  performance_reviews (create, frozen
                                       scans projects.tasks[]+tickets         KPI snapshot at creation time)
                                       for ONE employee/month)
my-performance/page.tsx   →    direct query: where("employeeId","==",  →  performance_reviews (read, scoped     →    My Performance:
                                  profile.uid), orderBy("reviewPeriod")     server-side to one employee)               latest/3mo-avg/trend/history
```

**Analytics exit points**: the five tabs themselves only — nothing else in the codebase reads Analytics' computed output.

**My Performance exit points**: the page itself only — a true dead-end self-view, by design.

### 2.2 Every collection Analytics reads, and exactly how — the central finding

Every underlying read is confirmed to be an **unbounded full-collection fetch**, with `orderBy()` at most and **no `limit()` anywhere in the chain**:

| Function | File | Query shape |
|---|---|---|
| `getInvoices()` | `finance-service.ts` | `getDocs(query(collection(db,"invoices"), orderBy("createdAt","desc")))` — no cap |
| `getTickets()` | `tickets-service.ts` | same shape, `tickets` |
| `getStaffList()` | `tickets-service.ts` | `getDocs(collection(db,"users"))` — **not even an `orderBy`** |
| `getLeads()` | `crm-service.ts` | same shape, `leads` |
| `getClients()` | `crm-service.ts` | same shape, `clients` |
| `getProjects()` | `projects-service.ts` | same shape, `projects` (including every embedded `tasks[]` array) |
| `getSubscriptions()` | `subscriptions-service.ts` | same shape, `subscriptions` |

`getMasterDashboard()` alone triggers six of these in parallel on every Command Centre load. The 60-second cache is keyed per-page (`"master"`, `"sales"`, `"service"`, `"team"`, `"retention"`), not per-collection — so `getInvoices()` is independently re-fetched from scratch by Command Centre, Sales, and Retention, with zero cross-page reuse of the same underlying data. This is the single most severe instance of the full-fetch anti-pattern found in the codebase to date, by sheer multiplication of collections × pages with no shared cache and no `limit()` anywhere in the chain.

**My Performance, by contrast, gets this right** — its one query is genuinely server-side filtered: `where("employeeId","==",profile.uid)`. It is not a case of fetching everyone's reviews and filtering to one person client-side.

### 2.3 Role gating — the nav-tab-vs-route-reachability pattern, again

**Analytics**: the only enforced gate is `analytics/layout.tsx`'s `<ProtectedRoute requiredPermission="view:analytics">` — none of the five subpages add their own check. The layout's `ALL_TABS` array additionally assigns a **narrower** `roles` list per tab purely to decide which tab link renders (e.g. Sales & Revenue's tab is only shown to `["CEO","CFO","Brand Lead","Social Media Lead"]`) — this is UI-only, not a route guard. Project Manager and IT Manager both hold `view:analytics` (passing the real gate) but appear in zero tabs' `roles` arrays — they can reach every subpage by direct URL with no link ever shown to them. This is the identical shape to Incidents D1 (tab visibility ≠ route protection), recurring in a different module.

**My Performance**: nav gate and route gate both use the same `view:own` check, in agreement with each other — no divergence here. Unlike Analytics, there's nothing to flag on this specific point.

---

## PART 3 — DEVIATIONS

### ANALYTICS

#### Analytics D1 — Invariant #3 violated: per-collection rule rejections are silently absorbed into "0," indistinguishable from genuine emptiness
**File**: `analytics-service.ts` — every collection read is wrapped in `safe()` (`const safe = <T,>(p: Promise<T[]>) => p.catch((): T[] => [])`).

Concretely confirmed against real role/rule data: **Brand Lead and Social Media Lead** both hold `view:analytics` and the layout's tab list explicitly invites them onto Sales & Revenue, but neither passes `hasViewFinance()` (not CFO/Finance Officer/Sales Rep) — so their `getInvoices()` call is rule-rejected, `safe()` substitutes `[]`, and they see a permanently empty "Revenue by Client," "Pipeline Value," and "Deals Closed" with no error and no way to tell this apart from genuinely zero data. Same finding for **HR** on Team Productivity: HR passes `hasViewTickets()` but not `hasViewProjects()` (no `isHR()` clause on that rule), so the "Projects On Track/Delayed" section silently renders zero for a tab the layout was explicitly built to show them.

**Status: fixed (commit `59b473d`).** `safe()` was replaced with `fetchOrDenied()`, which classifies each collection-read failure: a genuine `permission-denied` rejection is tagged `denied: true`, any other failure still degrades to `denied: false` (unchanged fail-soft behavior, deliberately scoped to the rejection case this finding identified, not a general error-classification rework). Every aggregation function (`getMasterDashboard`, `getSalesAnalytics`, `getServiceAnalytics`, `getTeamAnalytics`, `getRetentionAnalytics`) now returns a `deniedSources: AnalyticsSource[]` array tagging exactly which underlying collection(s) were rejected, and each page maps its sections/KPIs to the specific source(s) they actually depend on (not a single page-level flag, since several pages mix sources with different access outcomes for the same role). Brand Lead/Social Media Lead's Sales & Revenue tab and HR's Team Productivity tab now render "🔒 You don't have access to this data" on the affected sections instead of a bare 0, while sections backed by a collection the role *can* read still show real data on the same page — matching the denied-vs-empty distinction established for the CRM portal fix earlier this session. Verified against the real rule gaps (not a synthetic scenario) via `tests/analytics/denied-vs-empty-and-low-sample.test.ts`, using real signed-in Brand Lead/HR sessions against the actual `firestore.rules`.

#### Analytics D2 — Invariant #1 violated: tab visibility is UI-only, not a route guard
**File**: `analytics/layout.tsx` — confirmed in §2.3 above. Project Manager and IT Manager hold the real permission gate but no tab link; both can reach every subpage by direct URL.

**Status: open.**

#### Analytics D3 — mislabeled metrics: "Pipeline Value" and "Deals Closed" are invoice-derived, not CRM-derived
**File**: `analytics-service.ts` — "Pipeline Value" = `invoices.filter(i => i.status === "pending").reduce(...)`; "Deals Closed (MTD)" = count of paid invoices in the current month. Both sit on the same "Sales & Revenue" page alongside genuinely CRM-sourced metrics ("Lead Conversion Rate," computed from `leads`), with no indication that "pipeline" and "deals" here mean something different from what a CRM-pipeline reading of those words would imply.

**Status: open.**

#### Analytics D4 — Invariant #2 violated: KPIs computed from a sample of 1-2 records render with full visual confidence
**File**: `analytics-service.ts` (percentage guards only check for division-by-zero, not small-N); `sales/page.tsx`, `retention/page.tsx`, `service/page.tsx` (fixed color thresholds applied regardless of N).

**Confirmed with real production data** (queried directly): `leads` has exactly 1 real document, `stage: "client"`. "Lead Conversion Rate" = `convertedLeads / totalLeads * 100` = 1/1 = **a confident "100%," styled identically to a real 500-of-500 result**, with no "insufficient data" caveat anywhere. Same risk pattern flagged in the Expense Budget feature's zero-data framing, now confirmed live: this isn't a hypothetical, it's the actual number the page would render today.

**Status: fixed (commit `59b473d`).** Added `LOW_SAMPLE_THRESHOLD = 10` to `analytics-service.ts`: below a denominator of 10, a single record swings the rate by ≥10 percentage points — too coarse for the percentage to mean anything a viewer should act on, matching the common "small cell" convention in basic reporting. Each affected rate's real numerator/denominator is now exposed on its data interface (`SalesData.totalLeads`/`convertedLeads` already existed; `ServiceData.slaBreachSampleSize` and `RetentionData.retentionSampleSize` were added) so the UI can render `"${rate}% (${n} of ${d})"` in neutral `text-white/50` styling instead of the normal confidence-implying color, plus a "Low sample size" caveat line. Four metrics now carry this guard: Lead Conversion Rate (Sales & Revenue), SLA Breach Rate (Service Delivery), On-Time Rate (Team Productivity), and Retention Rate (Client Retention). Verified against the real production case — `leads` still has exactly 1 document, and Lead Conversion Rate now renders `"100% (1 of 1)"` with the caveat rather than a bare confident `"100%"` — and confirmed a synthetic 12-lead sample does **not** trigger the caveat (`tests/analytics/denied-vs-empty-and-low-sample.test.ts`).

#### Analytics D5 — duplicate, independently-coded logic for the same metric across pages
**File**: `analytics-service.ts` — "Active Clients" (`clients.length`, no status filter despite the label) appears identically on both Command Centre and Client Retention; "Revenue by Client"/"Top Clients by Value" run the same grouping reducer independently in two functions rather than sharing one helper.

**Status: open.**

#### Analytics D6 — stale denormalized client-name grouping
**File**: `analytics-service.ts` — every client-revenue aggregation groups by `invoice.client.name` (a frozen string snapshot), not a live join by `clientId`. If a client is renamed after invoices exist, historical revenue silently splits across two name-buckets with no reconciliation. Same fragile-string-match family as Vendors D2 and Assets D3 in the reference docs, recurring a third time.

**Status: open.**

#### Analytics D7 — "Retention Rate" denominator mixes two different collections' record counts
**File**: `analytics-service.ts` — `total = clients.length + retained`, where `retained` is a count of `leads` with `stage === "retained"` and `clients.length` counts a completely different collection. Nothing prevents a lead that's also a real client from being double-counted in this denominator — no dedup/cross-reference exists.

**Status: open.**

---

### MY PERFORMANCE

#### Performance D1 — confirmed correctly scoped: a genuine, rule-enforced self-view
This is not a deviation — included because the investigation's central question (does "My Performance" mean self-view or management view?) needed a definitive answer, and the answer is unambiguous: **self-view, correctly enforced at both layers.** The query is `where("employeeId","==",profile.uid)`, and `firestore.rules`' `performance_reviews` read rule independently enforces `request.auth.uid == resource.data.employeeId` as one of its OR-branches — even if the client-side query were ever removed or tampered with, the rule alone still blocks reading anyone else's reviews. No route param, no employee picker, no code path lets a signed-in user see another employee's data from this page.

**Status: confirmed correct, not a deviation.**

#### Performance D2 — Invariant #5 violated, in the opposite direction: no error handling on the one fetch this page makes
**File**: `my-performance/page.tsx` (`load()`) — no `try`/`catch` around the `getDocs()` call.

If the query throws for any reason, the promise rejection is unhandled and `loading` never resolves — the page is left permanently spinning, with no error message. Same defect family as Assets D2/Incidents D3 in the reference docs, but worse here: those left one button stuck, this leaves the entire page stuck.

**Status: open.**

#### Performance D3 — three independent, non-shared implementations of "per-employee productivity," any two of which could disagree and neither side would know
**Files**: `api/performance/compute/route.ts` (server-side, scans one employee/month, seeds the two locked KPI fields at review-creation time); `analytics-service.ts`'s `getTeamAnalytics()` (client-side, all-time, no date filtering, feeds the unrelated Team Productivity tab); the frozen `kpiScores` values inside each saved `performance_reviews` document (point-in-time output of the first, displayed forever by both `hr/performance` and `my-performance`).

None of these three call into each other, and they use materially different filtering (one is month-scoped, one is all-time). A reviewer's "tickets resolved" shown on their own My Performance page for June and the "open tickets" count an HR/CEO viewer sees on Analytics' Team Productivity tab for the same employee are not expected to reconcile, and the codebase gives no indication anywhere that this is the case.

**Status: open.**

#### Performance D4 — confirmed real data: the module has never been exercised
**Production query, direct, this session**: `performance_reviews` collection has **zero real documents**. My Performance has literally nothing to show for any real user today — the page, the gates, and the rule are all correctly built and currently dormant.

**Status: not a defect — production-data context, see snapshot below.**

---

## Production data snapshot (confirmed via direct read-only query, same session as this audit)

| Collection | Real count | Notes |
|---|---|---|
| `invoices` | **3** | 2 `paid`, 1 `pending` — feeds every Analytics revenue/pipeline calculation |
| `tickets` | **1** | status `closed` — "Open Tickets" KPI is currently 0 company-wide; SLA Breach Rate's denominator (`open.length`) is 0, hitting the zero-guard, not a real percentage |
| `clients` | **1** | feeds "Active Clients" (no status filter — see Analytics D5) and the Retention Rate denominator |
| `leads` | **1** | `stage: "client"` — this single record is what produces the misleadingly-confident "100%" Lead Conversion Rate described in Analytics D4 |
| `projects` | **1** | feeds Team Productivity's task/project aggregates |
| `subscriptions` | **1** | feeds Command Centre's "Expiring Subscriptions" KPI |
| `users` | **9** | real staff headcount — confirms a real team exists even though almost every other collection has ≤3 real records, sharpening the "9 people, 1 ticket, 1 client, 1 lead" picture |
| `performance_reviews` | **0** | confirms Performance D4 — the entire My Performance feature is currently dormant, not broken |

**The N=1/N=3 reality directly confirms Analytics D4's risk, not hypothetically.** With 9 real staff accounts and at most 3 real records in any single business collection, nearly every percentage/rate Analytics computes today is derived from a sample too small for the metric to mean anything statistically, while rendering with the exact same visual confidence (color-coded thresholds, no caveat) it would use at real scale. This is the same "implied trend from near-zero data" pattern flagged in the Expense Budget feature, here recurring across an entire dashboard built to look authoritative.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- ~~Should Analytics' per-collection failures (D1) surface a visible "some data may be incomplete due to permissions" notice instead of silently rendering zero, or is the current "always show *a* number" behavior an intentional simplicity tradeoff?~~ **Resolved by commit `59b473d`**: each affected section now surfaces a per-section "you don't have access to this data" notice rather than either a silent zero or a single page-level banner.
- Is "Pipeline Value"/"Deals Closed" (D3) meant to eventually pull from `leads` instead of `invoices`, or is the finance-centric definition deliberate for this specific dashboard (i.e., "pipeline" here means "money not yet collected," not "deals not yet won")? — still open, untouched by today's fix.
- ~~Given the real data shows every Analytics percentage is currently computed from N≤3, should the dashboard suppress or visually de-emphasize rate/percentage KPIs below some minimum sample size until real usage grows, rather than waiting for an organic increase in data volume to make the numbers meaningful on their own?~~ **Resolved by commit `59b473d`**: rate KPIs below a denominator of 10 now de-emphasize (neutral color + `(n of d)` + caveat) rather than rendering with full visual confidence.
- Is the three-way split in "per-employee productivity" calculation (Performance D3) intentional separation of concerns (compute-at-review-time vs. live-dashboard-aggregate are different products), or should they share one underlying calculation to guarantee the numbers reconcile? — still open, untouched by today's fix.
