import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { sendEmail, taxReminderEmail } from "@/lib/email-service";

export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const db      = getAdminDb();

    /* Fetch the caller's own profile for tokens + email */
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    const user    = userDoc.data() as { email: string; role: string; fcmTokens?: string[] } | undefined;

    if (!user) return NextResponse.json({ error: "user profile not found" }, { status: 404 });

    const tokens = user.fcmTokens ?? [];
    const email  = user.email;

    const title   = `Test Notification — Chronix ERP ${APP_VERSION_SHORT_LABEL}`;
    const message = `This is a test notification for the ${user.role} role. Push and email delivery confirmed.`;
    const link    = "/dashboard/notifications";

    /* Write in-app notification — dedupe per user per day so tests don't pile up */
    const today      = new Date().toISOString().slice(0, 10);
    const dedupeKey  = `notif-test-${decoded.uid}-${today}`;
    const existing   = await db.collection("notifications")
      .where("dedupeKey", "==", dedupeKey).limit(1).get();
    if (existing.empty) {
      await db.collection("notifications").add({
        type:        "renewal_due",
        title,
        message,
        link,
        read:        false,
        targetRoles: [user.role],
        createdAt:   new Date().toISOString(),
        dedupeKey,
      });
    }

    const results: Record<string, string> = { inApp: "sent" };

    /* Push — isolated so an FCM error doesn't 500 the whole request */
    if (tokens.length > 0) {
      try {
        await sendPushToTokens(tokens, { title, body: message, link });
        results.push = `sent to ${tokens.length} device${tokens.length !== 1 ? "s" : ""}`;
      } catch (pushErr) {
        console.error("[notifications/test] push failed:", pushErr);
        results.push = `failed — ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`;
      }
    } else {
      results.push = "skipped — no FCM token registered for this user";
    }

    /* Email */
    if (email) {
      const emailResult = await sendEmail([email], title, taxReminderEmail(title, message, link));
      if (emailResult.sent)          results.email = `sent to ${email}`;
      else if (emailResult.skipped)  results.email = `skipped — ${emailResult.skipped}`;
      else                           results.email = `failed — ${emailResult.error}`;
    } else {
      results.email = "skipped — no email on profile";
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[notifications/test] error:", err);
    return NextResponse.json({ error: `Internal server error — ${detail}` }, { status: 500 });
  }
}
