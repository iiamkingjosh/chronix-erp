# Projects, Tickets & Time Tracking — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md) §D.
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

This module covers delivery work: Projects track scoped engagements (tasks, milestones, files, activity history), Tickets track support requests against an SLA, and Time Tracking logs billable/non-billable hours against both. Unlike Finance/CRM, this domain has no direct ledger interaction — its outputs are operational (who's doing what, are we meeting SLA, how many hours were billed) rather than accounting entries, though `linkProjectInvoice` and billable-hours data feed *into* Finance/HR from elsewhere.

### 1.2 Personas / roles

| Role | What they're meant to do here |
|---|---|
| **Project Manager** | `manage:projects`, `manage:tickets`, `manage:time` — owns delivery across the board. |
| **IT Manager** | `manage:tickets` — support-queue ownership. |
| **Brand Lead** | `manage:projects` — for brand/marketing engagements specifically. |
| **CFO** | `view:crm`, `view:projects` — financial oversight context, not an operator here. |
| **Any team member (non-manager)** | Per `firestore.rules`, may narrowly edit a project's `tasks`/`progress`, append to `activity`, or upload `files` on a project they're a member of — without needing `manage:projects`. |
| **A ticket's assignee (non-manager)** | Per `firestore.rules`, may narrowly update `status`/`resolution`/`activity`/`resolvedAt` on their own assigned ticket. |
| **Staff** | `manage:time` (own entries), `view:projects`, `view:tickets`. |

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **A project's progress percentage always reflects its actual task state**, computed by one formula, consistently, whether read from the freshly-persisted document or shown optimistically before the write confirms.
2. **The activity feed is the audit trail of what happened to a project.** Every state change the type model declares as loggable (status changes, task completion, milestone completion, member changes) must actually produce an activity entry — a state change with no feed entry didn't, as far as anyone reviewing history later can tell, "happen."
3. **SLA compliance metrics must be computed from real resolved-ticket data.** "Average resolution time" and "compliance rate" on the SLA dashboard must reflect what was actually resolved and when — never a hardcoded stand-in that makes every period look perfect by construction.
4. **The SLA deadline displayed for a ticket is the deadline that's actually being measured against.** If a per-priority target is shown as policy, every ticket of that priority should be measurably held to it — not silently overridable into irrelevance.
5. **A time entry's "voided" correction (amend) must succeed completely or not at all.** Voiding the original and creating the corrected replacement are two writes standing in for one logical action; one succeeding while the other fails must not be possible to reach through normal use.
6. **Whatever access `firestore.rules` grants to a non-manager (narrow task/activity/file edits, narrow ticket self-updates) must be exactly what the UI lets them attempt — no more, no less.** A button shown that the rules will reject is a broken promise to the user; a permission the rules grant that the UI never exposes is a feature nobody can use.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms)                  SERVICE LAYER                                FIRESTORE / STORAGE                          EXIT
─────────────────                 ──────────────                               ────────────────────                          ────
projects/new                  →   projects-service.createProject          →    projects (create)                       →    project detail
projects/[id] (status)        →   projects-service.updateProjectStatus    →    projects (update status + activity arrayUnion) → activity feed
projects/[id] (note)          →   projects-service.addProjectActivity     →    projects (activity arrayUnion)          →    activity feed
projects/[id] (task add/done) →   projects-service.updateTasks            →    projects (whole-array overwrite: tasks, progress) → task board — NO activity entry produced (see D1)
projects/[id] (milestone done)→   projects-service.completeMilestone      →    projects (whole-array overwrite: milestones + activity arrayUnion)
projects/[id] (file upload/del)→  projects-service.addProjectFile / removeProjectFile → projects (arrayUnion/arrayRemove) + Storage object
projects/[id] (delete)        →   projects-service.deleteProject          →    Storage cleanup (best-effort) + projects (delete)
projects/[id] (link invoice)  →   projects-service.linkProjectInvoice     →    projects (update invoiceId/invoiceRef)  →    cross-module reference to Finance

tickets/new                   →   tickets-service.createTicket            →    tickets (create, status="open", slaDeadline) → ticket detail, SLA dashboard
tickets/[id] (status)         →   tickets-service.updateTicketStatus      →    tickets (update status + notes arrayUnion; resolvedAt/closedAt conditional) → SLA dashboard
tickets/[id] (note)           →   tickets-service.addTicketNote           →    tickets (notes arrayUnion)
tickets/[id] (feedback)       →   tickets-service.updateClientFeedback    →    tickets (update clientFeedback)
tickets/[id] (reassign)       →   tickets-service.reassignTicket          →    tickets (update assignedTo + notes arrayUnion) + notification
tickets/sla (dashboard)       →   tickets-service.getOpenTicketsWithSLA   →    tickets (read only — `resolved` is a hardcoded empty array, see D3) → SLA compliance UI (dead-computed)

time/page.tsx (log time)      →   timetrack-service.createTimeEntry       →    time_entries (create)                   →    time list, billable-hours reporting (cross-module into HR/payroll)
time/page.tsx (amend)         →   timetrack-service.amendTimeEntry        →    time_entries (update original isVoided=true) + time_entries (create corrected, amendedFromId) →  time list
```

**Exit points**: project/ticket/time-entry detail and list pages, the SLA compliance dashboard (currently structurally inert — see D3), and cross-module references out to Finance (`linkProjectInvoice`) and HR/payroll (billable hours feeding payroll computation, per the HR/Payroll doc).

### 2.2 Mutation paths — and which ones do NOT share the same underlying logic

| Conceptual operation | Canonical path | Duplicate / divergent path(s) | Shared? |
|---|---|---|---|
| Edit a list field on a project (tasks/milestones vs. activity/files) | *(no single paradigm — two coexist by design or drift)* | `updateTasks`/`updateMilestones`/`completeMilestone` overwrite the **whole array**; `addProjectActivity`/`addProjectFile`/`removeProjectFile` use **`arrayUnion`/`arrayRemove`** | ⚠️ **Two incompatible consistency models on the same document** |
| Log "something happened" to a project's history | `updateProjectStatus` (writes a `status_change` activity entry) | `updateTasks` (called by task-add and task-complete handlers) writes **no activity entry at all**, despite the type model declaring `task_done`/`member_added` activity types | ⚠️ **NOT shared — and the canonical path for task-related logging doesn't exist** |
| Compute project completion percentage | `calcProgress` (single helper, `projects.ts`) | Called once inside the service (`updateTasks`, authoritative) and again independently in the UI's optimistic state update (`projects/[id]/page.tsx`) | ⚠️ **Same formula, two independent call sites — not yet divergent, but nothing prevents it from becoming so** |
| Generate an ID for an activity/note/task entry | *(no canonical ID helper)* | `Date.now().toString()` used in most service functions and several page handlers; `crypto.randomUUID()` used in `projects/new/page.tsx` and `tickets/new/page.tsx` — **mixed within the same arrays** | ⚠️ **NOT shared — two ID schemes coexisting in the same data structure** |
| Escalate a ticket | *(declared: `tickets-service.escalateTicket`)* | No UI caller found anywhere in the audited pages — the ticket detail page's "Escalation" panel links out to project creation instead of calling this function | ⚠️ **Canonical function exists; the feature it implements has no reachable entry point** |
| Void + recreate a time entry (amend) | `timetrack-service.amendTimeEntry` (single path) | none found | ✅ Shared function, ❌ rules only authorize half of it for non-owners (see D6) |

---

## PART 3 — DEVIATIONS (explicit — bugs against the invariants in §1.3)

### D1 — Invariant #2 violated: task creation and completion are invisible in the activity feed
**Files**: `src/lib/projects-service.ts` `updateTasks` (writes only `tasks`/`progress`/`updatedAt`) vs. `src/types/projects.ts` (`ProjectActivity.type` declares `"task_done"` and `"member_added"`, and `projects/[id]/page.tsx` even has rendering/styling logic for a `task_done` activity entry that nothing ever produces).
The type system and the detail-page UI both anticipate a feed entry that the service layer never writes. Anyone reviewing a project's history sees status changes and notes, but a complete record of every task added or finished is silently absent — invariant #2 is violated for the single most common kind of project activity.

### D2 — Invariant #1 at risk: whole-array task/milestone writes are a last-write-wins concurrency hazard
**File**: `src/lib/projects-service.ts` `updateTasks`/`updateMilestones`/`completeMilestone` (each sends the *entire* array back to Firestore based on the client's current in-memory copy).
Two team members editing tasks on the same project within the same few seconds will have one of them silently overwrite the other's change — there is no merge, no optimistic-lock check, no error. The invariant that "progress reflects actual task state" is only safe under the (unstated, untested) assumption that concurrent task edits never happen.

### D3 — Invariant #3 violated: SLA compliance metrics are structurally incapable of being correct
**File**: `src/app/(dashboard)/dashboard/tickets/sla/page.tsx` (`resolved` is hardcoded to a literal empty array).
`avgResolution` always evaluates to `0`; `complianceRate`'s `resolved.length === 0` branch always fires, always returning `100`. The comparison logic that would compute real compliance (`resolvedAt <= slaDeadline`) is fully written and correct-looking — it is simply never given any data. Every SLA report this dashboard has ever shown has been **0 hours average resolution, 100% compliance**, regardless of actual support performance.

### D4 — Invariant #4 violated: the displayed SLA target and the actually-enforced deadline can diverge per ticket
**File**: `tickets/new/page.tsx` (the `slaDeadline` field defaults from `SLA_HOURS`-by-priority but is then a freely editable `datetime-local` input) vs. `tickets/sla/page.tsx` ("SLA Targets by Priority" table renders `SLA_HOURS` as if it's policy).
Nothing ties a ticket's actual stored deadline back to its priority's nominal target after creation — the dashboard's policy table is decorative, not authoritative, for any ticket whose deadline was manually adjusted.

### D5 — Invariant #6 violated (confirmed rules/code mismatch): a non-manager assignee's own status change is rejected
**Files**: `firestore.rules` ticket partial-update rule (allows `hasOnly(["status","resolution","activity","updatedAt","resolvedAt"])` for a non-manager assignee) vs. `tickets-service.ts` `updateTicketStatus` (actually writes `status`, `updatedAt`, **`notes`** (arrayUnion — not `activity`), and conditionally `resolvedAt` **or `closedAt`**).
The rule's allowlist names fields (`activity`, `resolution`) that the ticket schema doesn't have; the code's actual field (`notes`) isn't in the allowlist. The net effect: **any non-manager assignee attempting the exact self-service status change the rules were written to permit will be rejected**, because the `notes` write alone breaks the `hasOnly` check. The UI offers this action to assignees with no indication it will fail.

### D6 — Invariant #5 & #6 violated (confirmed rules/code mismatch): admin amendment of another employee's time entry can partially fail
**Files**: `time/page.tsx` `canAmend` logic (allows amendment when `isOwner || canViewAll` — i.e. a privileged non-owner is allowed to attempt it) vs. `firestore.rules` `time_entries` update rule (only permits the void-flip when `employeeUid == auth.uid` — **no privileged-role exception**).
When a manager amends someone else's entry: the void-update on the original is rejected by rules, but the `addDoc` creating the "corrected" replacement has no owner check and **succeeds**. Result: a duplicate, non-voided time entry exists alongside the original, un-voided — violating invariant #5's "succeed completely or not at all," and silently, since `handleAmendSubmit` has a `try/finally` with no `catch` to surface the partial failure.

### D7 — Invariant #6 violated: the Time page's own access check is broader than what the rules actually allow
**File**: `time/page.tsx` computes `canViewAll` via `isRootAdmin || manage:hr || role==='CEO' || role==='CFO' || role==='System Admin'` (mixing a permission check with raw role-string equality) vs. `firestore.rules` `time_entries` read rule (`hasViewAll() || isCFO() || isSystemAdmin()` — **does not include HR via `manage:hr`**).
An HR user passes the page's own gate and calls `getAllTimeEntries`, which the read rule will then deny — the page believes HR can view everyone's time entries; the backend disagrees.

### D8 — Minor, flagged for completeness: inconsistent ID generation risks collisions in arrays used as React keys and dedupe identity
**Files**: `Date.now().toString()` (projects-service.ts, tickets-service.ts, and several page handlers) mixed with `crypto.randomUUID()` (`projects/new/page.tsx`, `tickets/new/page.tsx`) **within the same `activity`/`notes` arrays**.
Not currently observed to cause a failure, but two rapid same-millisecond writes using the timestamp scheme would collide on an ID used as both a React list key and (in some paths) a dedupe identity.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Is **ticket escalation** (`escalateTicket`) a feature that's mid-build and just hasn't been wired to a UI yet, or was it superseded by the "convert ticket to project" pattern the Escalation panel currently links to instead? Determines whether D-list treats the missing entry point as a bug or as dead code to remove.
- Was the **SLA dashboard's `resolved = []`** (D3) ever wired up and then regressed, or has it never worked? This affects whether the fix is "restore" or "implement for the first time" — worth knowing before estimating effort.
- Should **non-owner amendment of time entries** (D6) be a supported manager capability at all? If yes, the rule needs an explicit privileged-role clause; if no, the UI's `canViewAll` branch in `canAmend` should be removed rather than the rule loosened.
