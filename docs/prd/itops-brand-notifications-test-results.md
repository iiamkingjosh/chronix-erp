# IT Ops, Brand, Analytics, Audit & Notifications — Invariant Test Suite Results

> Detection only. No application code was changed. Run via `npm run test:emulator`.
> Tests live under `tests/notifications/` and `tests/itops/`.

## Confirmed deviations (matching the PRD's D-numbers, with real reproduced evidence)

| # | Test | Expected (invariant) | Actual (reproduced) |
|---|---|---|---|
| D1 | `notifyAssignment` | A notification meant to reach someone is delivered through one consistent mechanism | Confirmed `notifyAssignment` (the path used by ticket/project/lead assignment flows) only ever writes a Firestore doc — it succeeds with zero dependency on Admin Messaging or Resend, confirming no push/email is even attempted from this path |
| D3 | Incident terminal states | One mechanism for "this incident is over" | Confirmed `closeIncidentWithRCA` can be called on an incident still in `"investigating"`, skipping `"resolved"` entirely — the closed incident has `resolvedAt: undefined` while `status: "closed"`, confirmed directly |
| D5 | UI gate vs. rules (4 cases) | A button shown matches what rules allow, in both directions | **CFO** is rejected (`permission-denied`) updating an asset's status, despite the assets list page showing CFO an action button. **IT Manager**, conversely, is confirmed able to write to `knowledge_base`, approve a `change_log` entry, and create an `oncall_schedule` slot — all three succeed per rules even though none of the three corresponding UI pages expose a button for IT Manager to do so |
| D6 | `/api/notifications/send` | A failed delivery is visible as a failure | Confirmed: with `RESEND_API_KEY` genuinely unset (so `sendEmail()` resolves `{sent:false, skipped:"..."}` rather than throwing), the route still returns `{success:true}` to the caller — not a hypothetical, an actually-executed call with email delivery structurally impossible in this run |
| D7 | Notification type taxonomy | Type reflects the actual event | Confirmed (via source + an executed call to `checkTaxFilingReminders`) that all four distinct tax-deadline notifications it can produce share the identical `type: "renewal_due"`, despite a 19-value `NotificationType` enum existing |
| D8 | FCM token writes | One shared implementation | Confirmed both the client-side `saveFCMToken` and the Admin-SDK `register-token` route independently append to the exact same `push_tokens/{uid}` document — same end state, reached via two separately-maintained code paths, run back-to-back in one test |

## D4 — confirmed, but more precisely than originally framed

The original finding was "change-request status changes are never audit-logged, unlike incidents." Testing the **service layer** directly (not the page components) reveals the real picture: **neither `updateIncidentStatus` nor `updateChangeStatus` writes to `audit_logs` on its own** — confirmed zero audit entries for both after calling each directly. The inconsistency the inventory observed is entirely a property of which *page component* remembered to add a separate `logAuditEvent()` call afterward, not anything enforced near the data layer. This is a more useful framing than "changes are missing an audit call" — it explains *why* that gap exists and *why* nothing would catch a regression if incidents' audit call were ever accidentally removed too.

## Confirmed-correct (the invariant genuinely holds here)

- `updateIncidentStatus(..., "resolved")` correctly sets `resolvedAt` without touching `closedAt` or RCA fields — the two terminal-state mechanisms are at least internally consistent each on their own terms, even though they can be reached in an order that skips one entirely.

## What this doesn't cover yet

Brand/marketing's `createEmailCampaign`/`updateEmailCampaignStatus` weren't exercised directly — D2 (the email-campaign send dropping `customEmails`/`htmlOverride`) was already confirmed at the code-reading level in the PRD phase (the `SendBody` schema genuinely has no such fields) and re-confirming it here would mean simulating the brand/email page's exact fetch call, which is UI-layer composition rather than a service-layer invariant; the underlying API behavior it depends on (D6, success-despite-failure) is directly confirmed above. Analytics was not tested — it has no mutations, and its caching behavior is a performance characteristic, not an invariant from the PRD.

---

# Closing summary — all five modules complete

| Module | Tests added | Confirmed deviations | New findings (not in original PRD) | Corrected findings (original guess was wrong) |
|---|---|---|---|---|
| Finance & Tax | 20 | 6 | 3 | 2 |
| HR/Payroll & Auth/Admin | 23 | 6 | 2 (HR can't create employees; payroll can only reach the ledger via Root/SysAdmin) | 0 |
| CRM/Procurement/Subscriptions | 13 | 7 | 0 | 1 (CFO procurement restriction is intentional) |
| Projects/Tickets/Time | 16 | 8 | 1 (Firestore expression-limit on a legitimate write) | 0 |
| IT Ops/Brand/Notifications | 11 | 6 | 0 | 1 (D4 reframed — audit logging isn't enforced for either resource, not just one) |
| **Total** | **83** | **33** | **6** | **4** |

All 83 tests run together in one combined suite (`npm run test:emulator`) with no conflicts between modules' test files.

The single most consequential pattern across all five reports: **silent failure is the dominant error-handling style everywhere**, and **rules-vs-code drift is not a one-off** — it recurred independently in every module, sometimes in the UI's favor (a button shown that fails), sometimes in the rules' favor (a capability the UI never exposes). Both directions matter for different reasons: the first misleads users into thinking an action worked; the second hides working functionality from the people authorized to use it.

All five PRD/architecture docs and their corresponding test-results docs live under `docs/prd/`, cross-referencing `docs/REVERSE_ENGINEERING_INVENTORY.md`. The full test suite (`tests/`) is runnable anytime via `npm run test:emulator` and required no permanent system changes — the portable JDK it depends on lives in the gitignored `.tools/` directory.
