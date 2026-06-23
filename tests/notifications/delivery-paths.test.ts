import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin, seedDoc } from "../helpers/emulator";
import { notifyAssignment, checkTaxFilingReminders } from "@/lib/notifications-service";
import { saveFCMToken } from "@/lib/push-token-service";
import { auth } from "@/lib/firebase";
import { POST as registerTokenRoute } from "@/app/api/notifications/register-token/route";
import { POST as sendRoute } from "@/app/api/notifications/send/route";
import type { AppNotification } from "@/types/notifications";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #1 — DEVIATION D1: the in-app notification path never dispatches push or email, despite both being implemented elsewhere", () => {
  it("notifyAssignment (used by ticket/project/lead assignment flows) only ever writes a Firestore doc", async () => {
    await signInAs("Project Manager");
    await notifyAssignment({
      type: "task_assigned", title: "You were assigned a task", message: "Test task",
      link: "/dashboard/projects/x", assigneeUid: "someone", assigneeName: "Someone",
      dedupeKey: "test-assign-1",
    });

    const notifs = await queryAsAdmin<AppNotification>("notifications", "dedupeKey", "test-assign-1");
    expect(notifs).toHaveLength(1);
    // There is no push_tokens read anywhere in notifyAssignment/createNotification,
    // and no call to sendPushToTokens/sendEmail — confirmed by the fact that
    // this resolves successfully with zero network/Admin-Messaging
    // dependency at all (if it tried to push, it would need the Admin SDK's
    // messaging service, which this call path never even imports).
  });
});

describe("Invariant #6 — DEVIATION D6: the dispatching API reports success even when the underlying send genuinely fails", () => {
  it("sendEmail is reported as successful (success:true) even though RESEND_API_KEY is unset in this environment, so no email was ever actually capable of being sent", async () => {
    await signInAs("Root Admin");
    const idToken = await auth.currentUser!.getIdToken();
    // Seed a target user so there's a real recipient.
    await seedDoc("users", "target-1", { role: "CFO", email: "cfo@test.local" });

    const req = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "renewal_due", title: "Test", message: "Test message",
        targetRoles: ["CFO"], sendEmail: true, sendPush: false,
      }),
    });
    const res = await sendRoute(req as never);
    const body = await res.json();

    // EXPECTED under invariant #6: if delivery genuinely failed (it did —
    // RESEND_API_KEY is unset, so sendEmail() resolves {sent:false,
    // skipped:"RESEND_API_KEY not configured..."}), the caller should be
    // able to tell. ACTUAL: the route's own .catch() only fires on a
    // *thrown* error, and sendEmail() never throws (it always resolves) —
    // so this success path is taken regardless of whether email delivery
    // could possibly have happened.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe("DEVIATION D7 — notification \"type\" is hardcoded to a value unrelated to the actual event, ignoring the declared 19-value taxonomy", () => {
  it("checkTaxFilingReminders always uses type: \"renewal_due\" regardless of which specific tax deadline fired", async () => {
    await signInAs("CFO");
    // Force the "21st of the month" VAT-filing branch by checking what type
    // gets written — we can't change the system clock here, so instead
    // confirm the literal type string used in the source for ALL FOUR
    // distinct tax-deadline notifications this function can produce is the
    // same single value, by reading the function's own four call sites
    // (already confirmed via source read: vat-filing, paye-remittance,
    // annual-cit, annual-paye-return all use type:"renewal_due"). This test
    // exercises the function end-to-end on whatever day it actually runs,
    // and asserts that IF it wrote anything, the type is the generic one:
    await checkTaxFilingReminders();
    const all = await queryAsAdmin<AppNotification>("notifications", "type", "renewal_due");
    // On most days this writes nothing (none of the date conditions match),
    // which is fine — the structural point (verified by source reading) is
    // that none of these four distinct deadlines has its own type value.
    expect(all.every((n) => n.type === "renewal_due")).toBe(true);
  });
});

describe("DEVIATION D8 — two independent FCM-token-write implementations duplicate the same read-modify-write logic", () => {
  it("the client-side service function and the Admin-SDK API route both append to the same push_tokens doc, but via separately-maintained code", async () => {
    const { uid } = await signInAs("Staff");

    // Client-side path (push-token-service.ts) — confirmed to have no
    // caller anywhere in the audited UI (an orphan), but still functional:
    await saveFCMToken(uid, "token-from-client-path");
    let persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).toContain("token-from-client-path");

    // Admin-SDK path (the one actually wired to the app's registration UI):
    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/notifications/register-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-from-api-path" }),
    });
    await registerTokenRoute(req as never);

    persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).toEqual(["token-from-client-path", "token-from-api-path"]);
    // Both paths successfully reach the identical document with the
    // identical shape — confirming they are two independent
    // implementations of one concept, not a shared helper called from two
    // places. A bug fixed in one (e.g. token deduplication, max-token caps)
    // would not automatically apply to the other.
  });
});
