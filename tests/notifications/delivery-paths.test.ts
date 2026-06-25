import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent, readDocAsAdmin, queryAsAdmin, seedDoc } from "../helpers/emulator";
import { notifyAssignment, notifyStaffRegistered, checkTaxFilingReminders } from "@/lib/notifications-service";
import { signUp, signIn, signOutUser } from "@/lib/auth-service";
import { getCurrentPushToken, unregisterToken } from "@/lib/fcm-client";
import { auth } from "@/lib/firebase";
import { POST as registerTokenRoute } from "@/app/api/notifications/register-token/route";
import { POST as unregisterTokenRoute } from "@/app/api/notifications/unregister-token/route";
import { POST as sendRoute } from "@/app/api/notifications/send/route";
import { POST as pushRoute } from "@/app/api/notifications/push/route";
import { GET as cronTaxRoute } from "@/app/api/cron/tax/route";
import type { AppNotification } from "@/types/notifications";

// getCurrentPushToken() needs real browser APIs (service worker, FCM
// messaging) unavailable in this Node test environment, and
// unregisterToken() normally does a real fetch() to a relative URL, which
// can't resolve outside a real Next.js request context (same constraint
// hit earlier today with createNotification()'s push call). Mocked so the
// route + Firestore logic underneath is still genuinely exercised, not
// the browser-only token-retrieval/transport layer.
vi.mock("@/lib/fcm-client", () => ({
  getPushPermission:   vi.fn(() => "granted"),
  getCurrentPushToken:  vi.fn(),
  unregisterToken:      vi.fn(),
  registerToken:        vi.fn(),
  enablePushNotifications: vi.fn(),
}));

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

describe("FIXED: DEVIATION D6 — the response now reflects actual delivery status instead of an unconditional {success:true}", () => {
  it("emailSent is accurately false when RESEND_API_KEY is genuinely unset in this environment - not just present in the response shape", async () => {
    await signInAs("Root Admin");
    const idToken = await auth.currentUser!.getIdToken();
    // Seed a target user so there's a real recipient.
    await seedDoc("users", "target-1", { role: "CFO", email: "cfo@test.local" });
    expect(process.env.RESEND_API_KEY).toBeUndefined(); // confirm the premise, not assumed

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

    // FIXED: success:true still means "the request was valid and
    // processed" (matches REST convention - this is a 200, not a 500),
    // but emailSent now genuinely reflects what happened. Asserting the
    // real value (false), not merely that the key exists - sendEmail()
    // resolves {sent:false, skipped:"RESEND_API_KEY not configured..."}
    // rather than throwing, so this is the one accurate signal available.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
  });

  it("pushSent/emailSent are null (not false) when neither was attempted - distinguishing \"not attempted\" from \"attempted and failed\"", async () => {
    const { uid: cfoUid } = await signInAs("CFO");
    const idToken = await auth.currentUser!.getIdToken();
    await seedDoc("push_tokens", cfoUid, { tokens: [] }); // no tokens - push will be skipped, not attempted

    const req = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "renewal_due", title: "Test", message: "Test message",
        targetRoles: ["CFO"], sendEmail: false, sendPush: true,
      }),
    });
    const res = await sendRoute(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Zero push_tokens means push was never attempted (not attempted !=
    // failed) - null, not false, correctly distinguishing the two.
    expect(body.pushSent).toBeNull();
    expect(body.emailSent).toBeNull();
  });
});

describe("FIXED: DEVIATION D7 — each tax deadline now produces its own distinct notification type, not a shared generic one", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checkTaxFilingReminders() produces the correct, distinct type for each of its four deadlines - VAT, PAYE, annual CIT, annual PAYE return", async () => {
    await signInAs("CFO");

    vi.useFakeTimers({ toFake: ["Date"] }); // only Date - faking setTimeout/setInterval too stalls the real Firestore SDK's internal timers
    vi.setSystemTime(new Date("2026-03-21T09:00:00Z")); // VAT filing day
    await checkTaxFilingReminders();
    vi.setSystemTime(new Date("2026-03-10T09:00:00Z")); // PAYE remittance day
    await checkTaxFilingReminders();
    vi.setSystemTime(new Date("2026-01-05T09:00:00Z")); // annual CIT window
    await checkTaxFilingReminders();
    vi.setSystemTime(new Date("2026-01-28T09:00:00Z")); // annual PAYE return window
    await checkTaxFilingReminders();
    vi.useRealTimers();

    const vat   = await queryAsAdmin<AppNotification>("notifications", "type", "vat_filing_due");
    const paye  = await queryAsAdmin<AppNotification>("notifications", "type", "paye_remittance_due");
    const cit   = await queryAsAdmin<AppNotification>("notifications", "type", "annual_cit_due");
    const ann   = await queryAsAdmin<AppNotification>("notifications", "type", "annual_paye_return_due");
    expect(vat).toHaveLength(1);
    expect(paye).toHaveLength(1);
    expect(cit).toHaveLength(1);
    expect(ann).toHaveLength(1);

    // Confirms the OLD shared value is now genuinely unused by any of these.
    const stale = await queryAsAdmin<AppNotification>("notifications", "type", "renewal_due");
    expect(stale).toHaveLength(0);
  });

  it("api/cron/tax's WHT reminder - which checkTaxFilingReminders() doesn't cover at all - gets its own distinct type too", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    vi.useFakeTimers({ toFake: ["Date"] }); // only Date - see note above
    vi.setSystemTime(new Date("2026-04-21T09:00:00Z")); // VAT + WHT both due the 21st

    const req = new Request("http://localhost/api/cron/tax", {
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    const res = await cronTaxRoute(req as never);
    vi.useRealTimers();

    expect(res.status).toBe(200);
    const wht = await queryAsAdmin<AppNotification>("notifications", "type", "wht_remittance_due");
    const vat = await queryAsAdmin<AppNotification>("notifications", "type", "vat_filing_due");
    expect(wht).toHaveLength(1);
    expect(vat).toHaveLength(1); // confirms both same-day reminders got their own distinct types, not one shared value
  });
});

describe("FIXED: DEVIATION D8 — push-token-service.ts (the unused, never-wired client-side duplicate) deleted entirely", () => {
  it("registering a token still works correctly via the one remaining path (the Admin-SDK route)", async () => {
    const { uid } = await signInAs("Staff");

    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/notifications/register-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "token-from-api-path" }),
    });
    await registerTokenRoute(req as never);

    const persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).toEqual(["token-from-api-path"]);
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

  it("Staff (no manage:tax/brand/email_marketing) is rejected with 403", async () => {
    await signInAs("Staff");
    const idToken = await auth.currentUser!.getIdToken();
    const { status, body } = await callSendRoute(idToken);
    expect(status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("both the allowed CFO call and the rejected Staff call are recorded in audit_logs with role, targetRoles, and permission outcome", async () => {
    const { uid: cfoUid } = await signInAs("CFO");
    let idToken = await auth.currentUser!.getIdToken();
    await callSendRoute(idToken, ["CFO", "System Admin"]);

    const { uid: staffUid } = await signInAs("Staff");
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
      "audit_logs", "actorUid", staffUid
    );
    expect(rejectedEntries).toHaveLength(1);
    expect(rejectedEntries[0].permissionGranted).toBe(false);
    expect(rejectedEntries[0].action).toBe("reject");
    expect(rejectedEntries[0].actorRole).toBe("Staff");
  });
});

describe("New /api/notifications/push route — push-only delivery for the routine assignment/reminder path", () => {
  it("an internal staff member succeeds calling the push route directly", async () => {
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

describe("New: notifyStaffRegistered() alerts HR/Root Admin/System Admin on genuine new self-registration only", () => {
  // signUp() sets a session cookie via `document.cookie`, which doesn't
  // exist in this suite's Node test environment (no real test for signUp()
  // existed before now - prior auth tests only used signIn() or raw
  // createUserWithEmailAndPassword()). A minimal stub, not an app change.
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a new signup correctly creates a notification doc targeted at HR/Root Admin/System Admin, linking to the staff page", async () => {
    const email = `newstaff-${Date.now()}@test.local`;
    const profile = await signUp(email, "test-password-123", "New Staff Person");

    // Mirrors exactly what onRegister() does after signUp() succeeds.
    await notifyStaffRegistered({ uid: profile.uid, displayName: profile.displayName ?? profile.email, email: profile.email });

    const notifs = await queryAsAdmin<AppNotification>("notifications", "dedupeKey", `staff-registered-${profile.uid}`);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("staff_registered");
    expect(notifs[0].targetRoles).toEqual(["HR", "Root Admin", "System Admin"]);
    expect(notifs[0].link).toBe("/dashboard/staff");
    expect(notifs[0].message).toContain(email);
    expect(notifs[0].message).toContain("New Staff Person");
  });

  it("signUp() alone, without the explicit onRegister()-style call, does NOT create a staff_registered notification - the trigger lives in the page handler, not the account-creation function itself", async () => {
    const email = `newstaff2-${Date.now()}@test.local`;
    const profile = await signUp(email, "test-password-123", "Another New Person");

    const notifs = await queryAsAdmin<AppNotification>("notifications", "type", "staff_registered");
    expect(notifs.find((n) => n.message.includes(profile.email))).toBeUndefined();
  });

  it("logging in to an EXISTING account never creates a staff_registered notification - only genuine new registrations do", async () => {
    const email = `existing-${Date.now()}@test.local`;
    const password = "test-password-123";
    await signUp(email, password, "Existing Person");
    await signOutCurrent();

    await signIn(email, password);

    const notifs = await queryAsAdmin<AppNotification>("notifications", "type", "staff_registered");
    expect(notifs.find((n) => n.message.includes(email))).toBeUndefined();
  });
});

describe("New: signOutUser() now unregisters this device's push token - the logout gap found alongside D8", () => {
  // signOutUser() calls clearSessionCookie() via `document.cookie`, same
  // Node-environment gap as signUp() above - minimal stub, not an app change.
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("a real sign-out call genuinely removes the push token - the document is verified gone afterward, not just that the function didn't error", async () => {
    const { uid } = await signInAs("Staff");

    // Simulate this device having registered a token earlier (the real
    // registration path, unmocked).
    const idToken = await auth.currentUser!.getIdToken();
    await registerTokenRoute(new Request("http://localhost/api/notifications/register-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "device-token-1" }),
    }) as never);

    let persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).toContain("device-token-1");

    vi.mocked(getCurrentPushToken).mockResolvedValue("device-token-1");
    vi.mocked(unregisterToken).mockImplementation(async (token, idTok) => {
      await unregisterTokenRoute(new Request("http://localhost/api/notifications/unregister-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${idTok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }) as never);
    });

    await signOutUser();

    persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).not.toContain("device-token-1");
    expect(persisted?.tokens).toEqual([]);
  });

  it("a second device's token, registered separately, survives the first device's sign-out untouched", async () => {
    const { uid } = await signInAs("Staff");
    const idToken = await auth.currentUser!.getIdToken();

    for (const token of ["device-token-A", "device-token-B"]) {
      await registerTokenRoute(new Request("http://localhost/api/notifications/register-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }) as never);
    }

    vi.mocked(getCurrentPushToken).mockResolvedValue("device-token-A");
    vi.mocked(unregisterToken).mockImplementation(async (token, idTok) => {
      await unregisterTokenRoute(new Request("http://localhost/api/notifications/unregister-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${idTok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }) as never);
    });

    await signOutUser();

    const persisted = await readDocAsAdmin<{ tokens: string[] }>("push_tokens", uid);
    expect(persisted?.tokens).not.toContain("device-token-A");
    expect(persisted?.tokens).toContain("device-token-B"); // the other device's session is untouched
  });

  it("sign-out still completes successfully even if the unregister call itself fails", async () => {
    await signInAs("Staff");
    vi.mocked(getCurrentPushToken).mockResolvedValue("some-token");
    vi.mocked(unregisterToken).mockRejectedValue(new Error("simulated network failure"));

    await expect(signOutUser()).resolves.toBeUndefined();
    expect(auth.currentUser).toBeNull(); // sign-out itself genuinely completed
  });
});
