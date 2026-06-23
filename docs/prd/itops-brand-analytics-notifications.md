# IT Ops, Brand/Marketing, Analytics, Audit & Notifications — Reverse-Engineered PRD + Architecture Summary

> Reverse-engineered from code, not from a prior spec. Read alongside
> [`docs/REVERSE_ENGINEERING_INVENTORY.md`](../REVERSE_ENGINEERING_INVENTORY.md) §E.
> PRD/Architecture sections describe **intent as best it can be inferred from behavior**.
> The **Deviations** section is kept separate on purpose — those are not "how it works," they are bugs against the invariant stated just above them.

---

## PART 1 — PRD (reverse-engineered)

### 1.1 Purpose

This is the "everything else operational" bucket: IT asset/incident/change/on-call/knowledge management, brand/marketing content and campaigns, read-only analytics dashboards, a cross-cutting audit log, and the notification/push/email delivery layer that every other module relies on to actually reach a human. Unlike the previous three modules, there is no ledger interaction here at all — but there *is* an external-delivery responsibility (push notifications, transactional email) that nothing else in the codebase has.

### 1.2 Personas / roles

| Role | What they're meant to do here |
|---|---|
| **IT Manager** | `manage:assets`, `manage:incidents`, `manage:changes`, `manage:oncall`, `manage:knowledge` — owns the entire IT-ops surface. |
| **System Admin** | Mirrors IT Manager's write access across assets/incidents/changes/oncall/knowledge, plus everything else admin. |
| **CEO** | `view:assets`, `view:knowledge`, `view:incidents`, `view:changes`, `view:audit`, `view:oncall` declared as *view-only* in the permission model — but `firestore.rules` actually grants CEO **write** access to several of these collections directly (see Deviation D5's sibling note). |
| **Brand Lead / Social Media Lead** | `manage:brand`/`manage:social`/`manage:content`/`manage:campaigns`/`manage:email_marketing` — owns content calendar, campaigns, email sends. |
| **Any internal (non-client) staff** | Default read access to assets, incidents, changes, on-call, knowledge base, and their own notifications. |

### 1.3 What "this feature works correctly" means (concrete invariants)

1. **A notification that's supposed to reach a user via push or email must actually be delivered through one consistent mechanism.** It must not silently become "Firestore-doc-only" depending on which code path happened to create it — the recipient shouldn't have to guess whether they'll be pinged.
2. **An email campaign's actual recipients and actual content are what gets sent.** If a campaign was composed with specific addresses and a specific HTML body, the send action must use exactly those — not silently substitute a different recipient set and a different template while still reporting success.
3. **A resource's "this is over" terminal state is represented one way per resource type.** An incident is either resolved or it's closed — there should be one mechanism for reaching "done," not two that write different field sets for what is conceptually the same event.
4. **An oversight-relevant action leaves the same audit trail regardless of which page triggered it.** If incident status changes are audit-logged, change-request status changes (a directly analogous action) must be too — audit coverage shouldn't depend on which module's UI happened to remember to call it.
5. **A permission granted by `firestore.rules` corresponds to a reachable UI affordance, and a UI affordance shown corresponds to a permission the rules actually grant — in both directions.** A role that can write per the rules but has no button is a missing feature; a role with a button the rules will reject is a broken promise.
6. **An external send action that fails is visible as a failure, never silently reported as success.** If a push notification or an email doesn't go out, no caller anywhere in the system should come away believing it did.

---

## PART 2 — Architecture (reverse-engineered)

### 2.1 Data flow

```
ENTRY (UI forms)                  SERVICE LAYER                                FIRESTORE / EXTERNAL                          EXIT
─────────────────                 ──────────────                               ─────────────────────                          ────
assets/new                    →   asset-service.createAsset               →    assets (create)                         →    audit_logs, asset list
assets/[id] (assign/return)   →   asset-service.assignAsset / returnAsset →    assets (update + assignmentHistory)     →    audit_logs

incidents/new                 →   incident-service.createIncident         →    incidents (create) + fire-and-forget notifyAssignment → notifications (silent path — see D1)
incidents/[id] (status/RCA)   →   incident-service.updateIncidentStatus / closeIncidentWithRCA → incidents (update, two different field sets) → audit_logs

changes/new                   →   change-service.createChange             →    change_log (create)                     →    audit_logs
changes/page.tsx (approve/etc)→   change-service.updateChangeStatus       →    change_log (update)                     →    NO audit log written (see D4)

oncall/page.tsx               →   oncall-service.createOnCallSlot / deleteOnCallSlot → oncall_schedule (create/delete)  →    on-call schedule view

knowledge/new, [id]           →   knowledge-service.createArticle / updateArticleStatus / incrementViewCount → knowledge_base (create/update) → knowledge base list/detail

brand/assets, calendar, campaigns → brand-service.createBrandAsset / createContentPost / createCampaign / etc. → brand_assets / content_posts / campaigns (create/update)
brand/email (compose → send)  →   createEmailCampaign (draft) → POST /api/notifications/send (Admin SDK) → resolves recipients by role (NOT the campaign's intended emails — see D2) → notifications (create) + FCM push + Resend email → updateEmailCampaignStatus(...,"sent")

(any module's notifyAssignment)→  notifications-service.createNotification →    notifications (create) — Firestore only, NO push/email dispatch
api/notifications/send        →   server-side, Admin SDK                  →    notifications (create) + reads users/push_tokens → FCM push + Resend email (the only path that actually delivers externally)
api/notifications/register-token →server-side, Admin SDK                  →    push_tokens (read-modify-write append)
api/notifications/test        →   server-side, Admin SDK                  →    notifications (create) + FCM push + Resend email (self-test)

(any module's mutation)       →   audit-service.logAuditEvent             →    audit_logs (create) — errors always swallowed by design

analytics/*                   →   analytics-service (cached reads only)   →    reads invoices/tickets/leads/projects/etc.  →    sales/team/retention/service dashboards — NO mutation
```

**Exit points**: asset/incident/change/on-call/knowledge dashboards, the brand content calendar and campaign views, the audit log export, the analytics dashboards (read-only), and — externally — push notifications to mobile/web clients and transactional emails sent via Resend.

### 2.2 Mutation paths — and which ones do NOT share the same underlying logic

| Conceptual operation | Canonical path | Duplicate / divergent path(s) | Shared? |
|---|---|---|---|
| Create an in-app notification | `notifications-service.createNotification` (Firestore-only, no external dispatch) | `api/notifications/send` (Admin SDK; the *only* path that also dispatches FCM push + Resend email) | ⚠️ **NOT shared — most in-app callers (`notifyAssignment` and its domain wrappers) use the silent path** |
| Write/append an FCM push token | `push-token-service.saveFCMToken` (client SDK) | `api/notifications/register-token` (Admin SDK) — independently re-implements the same read-modify-write append | ⚠️ **NOT shared — two parallel implementations; the client-side one has no confirmed caller** |
| Reach "this is finished" for an incident | `incident-service.updateIncidentStatus(id, "resolved")` | `incident-service.closeIncidentWithRCA` (writes `closed` + RCA fields, bypassing `resolved` entirely) | ⚠️ **Two mechanisms, different field sets, different audit actions, for one conceptual terminal state** |
| Audit-log a status-change action | Incident status changes call `logAuditEvent` every time | Change-request status changes (`changes/page.tsx`) **never** call `logAuditEvent` | ⚠️ **NOT shared — same kind of action, inconsistent logging discipline** |
| Send an email campaign | *(intended: use the composed campaign's recipients + HTML)* | Actual: `api/notifications/send`'s schema has no `customEmails`/`htmlOverride` fields, so it silently resolves recipients by `targetRoles` and renders a fixed tax-activity template instead | ⚠️ **NOT shared — the send API was built for a different use case and the email-campaign UI is calling it as if it does something it doesn't** |

---

## PART 3 — DEVIATIONS (explicit — bugs against the invariants in §1.3)

### D1 — Invariant #1 violated: most in-app notifications never actually push or email anyone
**Files**: `src/lib/notifications-service.ts` (`createNotification`, `notifyAssignment` and all its domain wrappers — Firestore write only) vs. `src/app/api/notifications/send/route.ts` (the only code path that resolves recipients to push tokens/emails and actually dispatches).
Every "assign a ticket/task/incident to someone" flow across Projects, Tickets, Incidents, and HR calls the silent path. The recipient gets a Firestore document (visible only if they happen to open the Notifications page) and, in practice, no push and no email — despite `push-service.ts`/`email-service.ts` existing specifically to do that. This is the single most consequential deviation in this module: an assignment notification that nobody actually notices is functionally equivalent to no notification at all.

### D2 — Invariant #2 violated: email campaigns send to the wrong people with the wrong content, and still report success
**Files**: `brand/email/page.tsx` (`handleSend` POSTs `customEmails`/`htmlOverride`) vs. `api/notifications/send/route.ts` (`SendBody` schema declares neither field; recipients are resolved from `targetRoles` against `users`, and the email body is rendered from a fixed tax-activity template).
The campaign's actual intended audience (resolved client/lead emails) and actual intended content (`htmlContent`) are silently discarded. The send goes to whichever Root Admin/CEO/CFO users exist, with an unrelated template. The UI then marks the campaign `"sent"` with a `sentCount` based on the email list that was never used — a marketer reviewing campaign history sees a successful send to the number of people they intended, when neither the recipients nor the content matched.

### D3 — Invariant #3 violated: an incident can be "over" via two mechanisms that disagree on what that means
**File**: `src/lib/incident-service.ts` — `updateIncidentStatus(id, "resolved")` (sets `resolvedAt`) vs. `closeIncidentWithRCA` (sets `closed` + RCA fields, with no requirement that `resolved` was ever reached first).
An incident can go straight from `investigating`/`mitigated` to `closed` via the RCA path, skipping the `resolved` state and its `resolvedAt` timestamp entirely. Anything downstream that assumes "closed implies it passed through resolved" (e.g. a future MTTR report) would be wrong for any incident closed this way.

### D4 — Invariant #4 violated: change-request status changes are never audit-logged
**File**: `src/app/(dashboard)/dashboard/changes/page.tsx` `handleStatus` — no `logAuditEvent` call anywhere in the approve/reject/start/complete/fail flow, in direct contrast to `incidents/[id]/page.tsx`, which logs every status transition.
A change request — by definition a controlled, approval-gated process — leaves no audit trail for who approved it or when, while the operationally similar incident workflow does. If audit coverage is a compliance requirement anywhere in this system, this is the gap that would surface first.

### D5 — Invariant #5 violated: multiple confirmed two-way mismatches between UI gates and `firestore.rules`
**Files and specifics**:
- `assets/page.tsx` shows action buttons to CFO that the `assets` write rule (`isSystemAdmin || isCEO || canManageHR || isITManager`) does not include — the buttons exist; the writes will be rejected.
- `knowledge/page.tsx`'s write gate omits IT Manager, while the `knowledge_base` rule explicitly grants IT Manager write — IT Manager has no button for a permission they actually hold.
- `changes/page.tsx`'s approval gate omits IT Manager, while the `change_log` update rule includes IT Manager — same shape of gap.
- `oncall/page.tsx`'s gate is narrower than the `oncall_schedule` rule in one direction (rules additionally allow CEO/IT Manager to create/delete that the UI gate doesn't expose to one of those roles).

Each of these is a small inconsistency individually, but four independent instances of "the UI gate and the rule were edited separately and drifted" in one module is a pattern, not a coincidence.

### D6 — Invariant #6 violated: the notification-send API reports success even when delivery actually failed
**File**: `api/notifications/send/route.ts` — push (`sendPushToTokens(...).catch((e) => console.error(...))`) and email (`sendEmail(...).catch(...)`) failures are logged to the server console only; the route still returns `{ success: true }` to the caller regardless.
Any caller of this route — including the email-campaign send flow in D2 — has no way to know delivery actually failed. Combined with D2, a campaign can fail to send *and* be sent to the wrong people *and* still be recorded as a successful send with a plausible-looking recipient count, with zero operator-visible signal that anything went wrong.

### D7 — Minor, flagged for completeness: notification "type" is hardcoded and ignores the declared taxonomy
**Files**: `api/notifications/send/route.ts`, `api/notifications/test/route.ts`, `brand/email/page.tsx` all hardcode `type: "renewal_due"` regardless of the actual event, despite `types/notifications.ts` declaring 19 distinct `NotificationType` values.
Any future feature that needs to filter, route, or style notifications by type (e.g. "show me only assignment notifications") would find every notification sent through these three callers mislabeled.

### D8 — Minor, flagged for completeness: duplicated FCM-token-write logic, one copy possibly unused
**Files**: `src/lib/push-token-service.ts` (`saveFCMToken`) vs. `src/app/api/notifications/register-token/route.ts` — independently re-implement the same read-modify-write token-array append. No confirmed caller of the client-side service function was found in the audited scope.

---

## Open questions for product/business sign-off (not deviations — genuine ambiguity)

- Was the **silent (Firestore-only) notification path** (D1) ever intended to also push/email, with the dispatch logic simply never wired in — or is the in-app notification bell the *only* intended channel for assignment-type events, with push/email reserved deliberately for the higher-stakes flows (tax reminders, campaigns) that already use the dispatching API? This determines whether D1's fix is "wire the existing path up" or "the architecture is correct, just under-documented."
- Is `api/notifications/send` meant to become a general-purpose, campaign-content-aware send endpoint (in which case D2 is a missing-feature bug), or was the email-campaigns UI built ahead of a backend that was never finished to match it (in which case D2 is an incomplete-feature, not a regression)?
- Should **change-request audit logging** (D4) be added to match incidents, or is there a reason changes are intentionally exempt (e.g. a separate approval-history field not covered in this audit's scope)?

---

## All planned modules now covered

This completes the planned sweep: **Finance & Tax**, **HR/Payroll & Auth/Admin**, **CRM/Procurement/Subscriptions**, **Projects/Tickets/Time Tracking**, and this final cluster. Five PRD+architecture docs now exist under `docs/prd/`, all cross-referencing the master inventory at `docs/REVERSE_ENGINEERING_INVENTORY.md`. Let me know if you want a short cross-module rollup (e.g. a single prioritized deviation list ranked by severity/blast-radius across all five docs) or want to move straight into deciding which deviations to fix first.
