# Projects, Tickets & Time Tracking — Invariant Test Suite Results

> Detection only. No application code was changed. Run via `npm run test:emulator`.
> Tests live under `tests/projects/`, `tests/tickets/`, `tests/timetrack/`.

## A genuinely new finding, caught only because the suite runs against the real rules engine

Writing a test for "a non-manager CAN append an activity note" (expected to pass, per the PRD's own architecture notes) instead threw `permission-denied` — reproducibly, confirmed by running it in isolation twice, not a fluke. Root cause: the `projects` update rule is a 5-way OR chain —

```
canManageProjects() || resource.data.createdBy == auth.uid ||
isFilesOnlyUpdate() || isTeamMemberTaskUpdate() || isTeamMemberActivityUpdate()
```

— and `isFilesOnlyUpdate`, `isTeamMemberTaskUpdate`, and `isTeamMemberActivityUpdate` **each independently call `hasViewProjects()`**, which itself calls 8 separate role-check functions, each performing its own `get()` on the caller's `users/{uid}` doc — none of it memoized. For a Staff caller appending an activity note, evaluation falls through all four earlier clauses (none match) before reaching the one that does, accumulating enough expression evaluations to hit **Firestore's hard 1000-expression-per-request ceiling**. The legitimate, rules-intended self-service write is rejected.

This is reported as a new finding rather than folded into D1–D8 because it's structurally different from anything in the original PRD: it's not a logic mismatch between code and rules, it's the **rules file's own internal redundancy** causing a real platform limit to bite. One important caveat, stated plainly rather than overclaimed: this was confirmed against the **local Firestore emulator**, which enforces the same documented 1000-expression limit as production — but whether production Firestore's request-level caching/optimization makes this less likely to bite in practice was not independently verified here. Worth confirming directly against the deployed project, since the consequence (a legitimate note silently rejected) would matter if it reproduces.

## Confirmed deviations (matching the PRD's D-numbers, with real reproduced evidence)

| # | Test | Expected (invariant) | Actual (reproduced) |
|---|---|---|---|
| D1 | `updateTasks` | Task creation/completion should appear in the activity feed | Confirmed empty `activity` array after both adding a new task and marking a project's only task "done" — even though `progress` correctly updates to 100% and `ProjectActivity` declares a `"task_done"` type that's never produced by any code path |
| D2 | `updateTasks` concurrency | Concurrent task edits shouldn't silently clobber each other | Two callers each working from the same stale `[taskA, taskB]` snapshot, each marking a different task done and writing the whole array back — confirmed the second writer's stale copy of the first task overwrites the first writer's completion |
| D3 | SLA dashboard | Compliance metrics should reflect real ticket history | Reproducing `tickets/sla/page.tsx`'s exact code (`const resolved: Ticket[] = []`) against two real tickets — one resolved on time, one resolved late — confirmed `avgResolution` and `complianceRate` are dead constants (`0` and `100`) regardless |
| D4 | SLA deadline | The displayed per-priority target should be what's enforced | A `"critical"`-priority ticket created with a deadline a full year out persists exactly as given — nothing in `createTicket` or `firestore.rules` ties `slaDeadline` to `priority` |
| D5 | `updateTicketStatus` self-service | A non-manager assignee should be able to update their own ticket's status (the rule explicitly checks for this) | Confirmed: the ticket's own assigned Staff member, signed in as themselves, is rejected with `permission-denied` — because the write includes a `notes` field the rule's allowlist doesn't cover. A manager performing the identical status change on the same ticket succeeds, confirming the gap is specific to the self-service path |
| D6 | `amendTimeEntry` by a non-owner | The two-step amend should succeed completely or fail completely | Confirmed: System Admin amending someone else's entry has its void step rejected (not their entry) and — because void runs first and throws — the create step never runs either. This particular call order happens to fail safe; there is no transactional guarantee enforcing that, only the accident of which step comes first |
| D7 | Time page `canViewAll` vs. rules | One consistent definition | Confirmed: HR passes the Time page's own `canViewAll` check (via `manage:hr`) but is rejected (`permission-denied`) calling `getAllTimeEntries()` directly — the rule only allows `hasViewAll() || isCFO() || isSystemAdmin()`, which doesn't include HR |
| D8 | ID generation | One scheme, no collision risk | Confirmed `Date.now().toString()` produces identical IDs for two calls in the same millisecond, while `crypto.randomUUID()` (used elsewhere in the same codebase) never collides |

## Confirmed-correct (the invariant genuinely holds here)

- `isTeamMemberTaskUpdate` and the task-update self-service path work correctly for a non-manager **when reached early enough in the OR chain** not to hit the expression limit (confirmed in a separate, simpler test than the activity-note one above).
- A non-manager is correctly blocked from changing project *status* (touches a field outside every narrow self-service allowlist) — confirmed rejected.
- A manager (IT Manager) changing a ticket's status — including one assigned to someone else — works correctly.
- CFO's direct `time_entries` read access works correctly, in contrast to HR's.
- The straightforward case (owner amending their own time entry) completes both steps correctly: original voided, corrected entry created and linked via `amendedFromId`.

## What this doesn't cover yet

`escalateTicket` (confirmed to have no UI caller in the inventory phase) wasn't given a dedicated test, since there's no behavior to verify against an invariant if nothing in the audited UI ever calls it — that finding stands as a static/architectural observation rather than a runtime one. Storage-layer behavior for project file uploads/deletions (`addProjectFile`/`removeProjectFile`) wasn't exercised, since it would require a Storage emulator in addition to Firestore/Auth, not yet wired into this harness.
