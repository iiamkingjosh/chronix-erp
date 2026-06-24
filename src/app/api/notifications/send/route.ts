import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, taxActivityEmail } from "@/lib/email-service";
import { isRateLimited } from "@/lib/rate-limit";
import { hasPermission } from "@/types/roles";

interface SendBody {
  type:        string;
  title:       string;
  message:     string;
  link?:       string;
  targetRoles: string[];
  sendEmail?:  boolean;
  sendPush?:   boolean;
  dedupeKey?:  string;
}

/** Fire-and-forget, matching the existing server-route audit pattern in
 * api/admin/users/create/route.ts - never let audit logging block or fail
 * the actual response. */
function recordAudit(
  db: ReturnType<typeof getAdminDb>,
  fields: Record<string, unknown>
): void {
  db.collection("audit_logs").add({ ...fields, timestamp: new Date().toISOString() }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`notif:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const db = getAdminDb();

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    const callerRole = callerSnap.data()?.role as string | undefined;
    const callerName = callerSnap.data()?.displayName as string | undefined;

    const body = await req.json() as SendBody;
    const { type, title, message, link, targetRoles, dedupeKey } = body;

    /* Only the two real callers of this route may trigger it: CFO-driven
     * tax broadcasts (manage:tax) and Brand Lead-driven email campaigns
     * (manage:brand / manage:email_marketing). Previously gated by
     * nothing beyond a valid Firebase token - any authenticated user,
     * including Client portal accounts, could reach this. */
    const permitted = !!callerRole && (
      hasPermission(callerRole, "manage:tax") ||
      hasPermission(callerRole, "manage:brand") ||
      hasPermission(callerRole, "manage:email_marketing")
    );
    if (!permitted) {
      recordAudit(db, {
        actorUid: decoded.uid, actorName: callerName ?? "", actorRole: callerRole ?? "unknown",
        action: "reject", module: "notifications",
        details: `Permission denied: role "${callerRole ?? "unknown"}" attempted to send a "${type}" notification to roles [${targetRoles?.join(", ")}]`,
        targetRoles: targetRoles ?? [], permissionGranted: false,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (dedupeKey) {
      const existing = await db.collection("notifications").where("dedupeKey", "==", dedupeKey).limit(1).get();
      if (!existing.empty) return NextResponse.json({ skipped: true });
    }

    await db.collection("notifications").add({
      type,
      title,
      message,
      link:        link ?? null,
      read:        false,
      targetRoles,
      createdAt:   new Date().toISOString(),
      dedupeKey:   dedupeKey ?? null,
    });

    const usersSnap = await db.collection("users").get();
    const targetDocs = usersSnap.docs.filter((d) =>
      targetRoles.includes((d.data() as { role: string }).role)
    );
    const emails = targetDocs.map((d) => (d.data() as { email: string }).email).filter(Boolean);

    const ptSnaps = await Promise.all(
      targetDocs.map((d) => db.collection("push_tokens").doc(d.id).get())
    );
    const tokens = ptSnaps.flatMap((s) => (s.exists ? (s.data()?.tokens ?? []) : []));

    let pushSent: boolean | null = null;
    let emailSent: boolean | null = null;

    if (body.sendPush !== false && tokens.length > 0) {
      try {
        await sendPushToTokens(tokens, { title, body: message, link });
        pushSent = true;
      } catch (e) {
        pushSent = false;
        console.error("[notifications/send] push failed:", e);
      }
    }
    if (body.sendEmail !== false && emails.length > 0) {
      const emailResult = await sendEmail(emails, title, taxActivityEmail(title, message, link ?? "/dashboard/tax"));
      emailSent = emailResult.sent;
      if (!emailResult.sent) {
        console.error("[notifications/send] email failed:", emailResult.error ?? emailResult.skipped);
      }
    }

    recordAudit(db, {
      actorUid: decoded.uid, actorName: callerName ?? "", actorRole: callerRole,
      action: "create", module: "notifications",
      details: `Sent "${type}" notification ("${title}") to roles [${targetRoles?.join(", ")}] - ${targetDocs.length} recipient(s)`,
      targetRoles: targetRoles ?? [], permissionGranted: true,
      pushSent, emailSent,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications/send] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
