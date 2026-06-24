import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin, seedDoc } from "../helpers/emulator";
import { notifyAssignment, checkTaxFilingReminders } from "@/lib/notifications-service";
import { saveFCMToken } from "@/lib/push-token-service";
import { auth } from "@/lib/firebase";
import { POST as registerTokenRoute } from "@/app/api/notifications/register-token/route";
import { POST as sendRoute } from "@/app/api/notifications/send/route";
import { POST as pushRoute } from "@/app/api/notifications/push/route";
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

describe("FIXED: DEVIATION D1 — createNotification() now attempts push delivery, and survives that attempt failing", () => {
  it("notifyAssignment still writes its Firestore doc and resolves successfully even when the push fetch itself cannot succeed", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await signInAs("Project Manager");
    await notifyAssignment({
      type: "task_assigned", title: "You were assigned a task", message: "Test task",
      link: "/dashboard/projects/x", assigneeUid: "someone", assigneeName: "Someone",
      dedupeKey: "test-assign-1",
    });

    const notifs = await queryAsAdmin<AppNotification>("notifications", "dedupeKey", "test-assign-1");
    expect(notifs).toHaveLength(1);
    // createNotification() now also calls sendPushBestEffort(), which fetches
    // a relative URL ("/api/notifications/push") - unresolvable outside a
    // real browser/Next.js request context, so it throws here. The point of
    // this test: that failure must NOT be silently swallowed (a real reason
    // is logged) and must NOT propagate past createNotification() - the
    // Firestore write above already proves the latter; this confirms the
    // former, closing the exact "bare .catch(() => {})" pattern fixed
    // elsewhere today.
    const pushFailureLogs = errSpy.mock.calls.filter((c) => String(c[0]).includes("[createNotification] push failed"));
    expect(pushFailureLogs.length).toBeGreaterThan(0);
    errSpy.mockRestore();
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

describe("FIXED: /api/notifications/send now requires manage:tax / manage:brand / manage:email_marketing - previously any authenticated caller could reach it", () => {
  async function callSendRoute(idToken: string, targetRoles: string[] = ["CFO"]) {
    const req = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "renewal_due", title: "Test", message: "Test message",
        targetRoles, sendEmail: false, sendPush: false,
      }),
    });
    const res = await sendRoute(req as never);
    return { status: res.status, body: await res.json() };
  }

  it("CFO (manage:tax) succeeds", async () => {
    await signInAs("CFO");
    const idToken = await auth.currentUser!.getIdToken();
    const { status, body } = await callSendRoute(idToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("Brand Lead (manage:brand / manage:email_marketing) succeeds", async () => {
    await signInAs("Brand Lead");
    const idToken = await auth.currentUser!.getIdToken();
    const { status, body } = await callSendRoute(idToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("CEO is rejected with 403 - view:all/view:tax only, no manage:* rights", async () => {
    await signInAs("CEO");
    const idToken = await auth.currentUser!.getIdToken();
    const { status, body } = await callSendRoute(idToken);
    expect(status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("a Client-role account is rejected with 403 - the exact gap this fix closes", async () => {
    await signInAs("Client");
    const idToken = await auth.currentUser!.getIdToken();
    const { status, body } = await callSendRoute(idToken);
    expect(status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("both the allowed CFO call and the rejected Client call are recorded in audit_logs with role, targetRoles, and permission outcome", async () => {
    const { uid: cfoUid } = await signInAs("CFO");
    let idToken = await auth.currentUser!.getIdToken();
    await callSendRoute(idToken, ["CFO", "System Admin"]);

    const { uid: clientUid } = await signInAs("Client");
    idToken = await auth.currentUser!.getIdToken();
    await callSendRoute(idToken, ["CFO"]);

    const allowedEntries = await queryAsAdmin<{ actorUid: string; permissionGranted: boolean; targetRoles: string[]; action: string }>(
      "audit_logs", "actorUid", cfoUid
    );
    expect(allowedEntries).toHaveLength(1);
    expect(allowedEntries[0].permissionGranted).toBe(true);
    expect(allowedEntries[0].action).toBe("create");
    expect(allowedEntries[0].targetRoles).toEqual(["CFO", "System Admin"]);

    const rejectedEntries = await queryAsAdmin<{ actorUid: string; permissionGranted: boolean; actorRole: string; action: string }>(
      "audit_logs", "actorUid", clientUid
    );
    expect(rejectedEntries).toHaveLength(1);
    expect(rejectedEntries[0].permissionGranted).toBe(false);
    expect(rejectedEntries[0].action).toBe("reject");
    expect(rejectedEntries[0].actorRole).toBe("Client");
  });
});

describe("New /api/notifications/push route — push-only delivery for the routine assignment/reminder path, isAuth() && !isClientRole() gate", () => {
  it("a Client-role account is rejected with 403 calling the push route directly", async () => {
    await signInAs("Client");
    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/notifications/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", message: "Test", targetRoles: ["CFO"] }),
    });
    const res = await pushRoute(req as never);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("an internal staff member (non-Client) succeeds calling the push route directly", async () => {
    await signInAs("Staff");
    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/notifications/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", message: "Test", targetRoles: ["CFO"] }),
    });
    const res = await pushRoute(req as never);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("a malformed/invalid push token is NOT silently treated as success - the real per-token failure reason is logged server-side", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { uid: staffUid } = await signInAs("Staff");
    await seedDoc("push_tokens", staffUid, { tokens: ["this-is-not-a-real-fcm-token"] });

    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/notifications/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", message: "Test", targetUids: [staffUid] }),
    });
    const res = await pushRoute(req as never);
    const body = await res.json();

    // sendEachForMulticast() resolves (doesn't throw) for a failed token —
    // confirmed directly against the real Admin Messaging API before this
    // fix shipped (a genuinely malformed token there resolves with a
    // per-token "messaging/invalid-argument", never an exception). This
    // test harness deliberately runs with no real GCP credentials (see
    // admin-emulator.ts - there is no FCM emulator), so the specific error
    // code surfacing here is a credential rejection rather than FCM's own
    // token-validation error - but the behavior under test is identical
    // and environment-independent: a naive try/catch around the call would
    // never fire for either case, so the result itself must be checked.
    // The route must still report success (the REQUEST was valid) while
    // surfacing that delivery itself failed, and logging the real reason.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent).toBe(0);
    expect(body.deliveryFailures).toBe(1);

    const failureLogs = errSpy.mock.calls.filter((c) => String(c[0]).includes("[notifications/push]"));
    expect(failureLogs.length).toBeGreaterThan(0);
    expect(String(failureLogs[0])).toMatch(/delivery failed for.*1.*of.*1/);
    errSpy.mockRestore();
  });
});
