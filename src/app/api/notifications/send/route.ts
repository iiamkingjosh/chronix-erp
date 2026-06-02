import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, taxActivityEmail } from "@/lib/email-service";
import { isRateLimited } from "@/lib/rate-limit";

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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`notif:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await getAdminAuth().verifyIdToken(idToken);

    const body = await req.json() as SendBody;
    const { type, title, message, link, targetRoles, dedupeKey } = body;
    const db = getAdminDb();

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

    if (body.sendPush !== false && tokens.length > 0) {
      await sendPushToTokens(tokens, { title, body: message, link }).catch((e) =>
        console.error("[notifications/send] push failed:", e)
      );
    }
    if (body.sendEmail !== false && emails.length > 0) {
      await sendEmail(emails, title, taxActivityEmail(title, message, link ?? "/dashboard/tax")).catch((e) =>
        console.error("[notifications/send] email failed:", e)
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications/send] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
