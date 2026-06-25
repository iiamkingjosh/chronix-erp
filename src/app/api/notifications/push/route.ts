import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { isRateLimited } from "@/lib/rate-limit";

interface PushBody {
  title:        string;
  message:      string;
  link?:        string;
  targetUids?:  string[];
  targetRoles?: string[];
}

/** Push-only delivery for the routine, automated notification path
 * (assignment/reminder/lead/milestone events created via
 * notifications-service.ts's createNotification()) - deliberately
 * separate from /api/notifications/send, which is the manual broadcast
 * path (email+push, gated to manage:tax/manage:brand/manage:email_marketing).
 * That gate would wrongly block these callers, since whoever happens to be
 * viewing a subscriptions/invoices/leads/projects page triggers this, not
 * a privileged broadcaster. The bar here matches the `notifications`
 * collection's own create rule - any internal (non-Client) user - since
 * this adds a delivery channel for something already permitted today,
 * not a new capability. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`notif-push:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const db = getAdminDb();

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    const callerRole = callerSnap.data()?.role as string | undefined;

    if (!callerRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json() as PushBody;
    const { title, message, link, targetUids, targetRoles } = body;

    const uids = new Set(targetUids ?? []);
    if (targetRoles?.length) {
      const usersSnap = await db.collection("users").get();
      usersSnap.docs
        .filter((d) => targetRoles.includes((d.data() as { role: string }).role))
        .forEach((d) => uids.add(d.id));
    }

    if (uids.size === 0) return NextResponse.json({ success: true, sent: 0 });

    const ptSnaps = await Promise.all(
      [...uids].map((uid) => db.collection("push_tokens").doc(uid).get())
    );
    const tokens = ptSnaps.flatMap((s) => (s.exists ? (s.data()?.tokens ?? []) : []));

    if (tokens.length === 0) return NextResponse.json({ success: true, sent: 0 });

    // sendEachForMulticast() does NOT throw for invalid/expired tokens -
    // it resolves with a per-token success/failure breakdown (confirmed
    // empirically). A try/catch here would never fire for that case, so
    // the result itself must be checked - same "check the result, don't
    // assume success because nothing threw" discipline as sendEmail().
    const result = await sendPushToTokens(tokens, { title, body: message, link });
    if (result.failureCount > 0) {
      console.error(
        "[notifications/push] delivery failed for", result.failureCount, "of", tokens.length,
        "token(s):", result.errorCodes.join(", ")
      );
    }
    return NextResponse.json({
      success: true,
      sent:    result.successCount,
      ...(result.failureCount > 0 ? { deliveryFailures: result.failureCount } : {}),
    });
  } catch (err) {
    console.error("[notifications/push] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
