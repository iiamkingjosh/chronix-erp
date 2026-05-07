import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
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

    const title   = "Test Notification — Chronix ERP";
    const message = `This is a test notification for the ${user.role} role. Push and email delivery confirmed.`;
    const link    = "/dashboard/notifications";

    /* Write in-app notification */
    await db.collection("notifications").add({
      type:        "renewal_due",
      title,
      message,
      link,
      read:        false,
      targetRoles: [user.role],
      createdAt:   new Date().toISOString(),
      dedupeKey:   null,
    });

    const results: Record<string, string> = { inApp: "sent" };

    /* Push */
    if (tokens.length > 0) {
      await sendPushToTokens(tokens, { title, body: message, link });
      results.push = `sent to ${tokens.length} device${tokens.length !== 1 ? "s" : ""}`;
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
