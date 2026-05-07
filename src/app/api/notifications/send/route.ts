import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, taxActivityEmail } from "@/lib/email-service";

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
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await getAdminAuth().verifyIdToken(idToken);

    const body = await req.json() as SendBody;
    const { type, title, message, link, targetRoles, dedupeKey } = body;
    const db = getAdminDb();

    // Deduplication check
    if (dedupeKey) {
      const existing = await db.collection("notifications").where("dedupeKey", "==", dedupeKey).limit(1).get();
      if (!existing.empty) return NextResponse.json({ skipped: true });
    }

    // Write in-app notification
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

    // Fetch users for target roles (push tokens + emails)
    const usersSnap = await db.collection("users").get();
    const users = usersSnap.docs
      .map((d) => d.data() as { email: string; role: string; fcmTokens?: string[] })
      .filter((u) => targetRoles.includes(u.role));

    const tokens = users.flatMap((u) => u.fcmTokens ?? []);
    const emails = users.map((u) => u.email).filter(Boolean);

    if (body.sendPush !== false && tokens.length > 0) {
      await sendPushToTokens(tokens, { title, body: message, link });
    }
    if (body.sendEmail !== false && emails.length > 0) {
      await sendEmail(emails, title, taxActivityEmail(title, message, link ?? "/dashboard/tax"));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
