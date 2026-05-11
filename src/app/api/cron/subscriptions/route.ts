import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, subscriptionAlertEmail } from "@/lib/email-service";

function isCronRequest(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return !!secret && secret === process.env.CRON_SECRET;
}

const TARGET_ROLES = ["CEO", "System Admin", "CFO"];

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const db  = getAdminDb();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const [subsSnap, usersSnap] = await Promise.all([
      db.collection("subscriptions").get(),
      db.collection("users").get(),
    ]);

    const users = usersSnap.docs
      .map((d) => d.data() as { email: string; role: string; fcmTokens?: string[] })
      .filter((u) => TARGET_ROLES.includes(u.role));
    const tokens = users.flatMap((u) => u.fcmTokens ?? []);
    const emails = [...new Set(users.map((u) => u.email).filter(Boolean))];

    let sent = 0;

    for (const subDoc of subsSnap.docs) {
      const sub = { ...subDoc.data(), id: subDoc.id } as {
        id: string; itemName: string; expiryDate: string;
        cancelled: boolean; autoRemind: boolean;
      };

      if (sub.cancelled || !sub.autoRemind) continue;

      const expiry = new Date(sub.expiryDate + "T00:00:00");
      const days   = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);

      for (const band of [60, 30, 7, 1] as const) {
        if (days !== band) continue;

        const dk       = `sub-expiry-${sub.id}-${band}d`;
        const existing = await db.collection("notifications").where("dedupeKey", "==", dk).limit(1).get();
        if (!existing.empty) continue;

        const title   = `Subscription expiring in ${band} day${band === 1 ? "" : "s"}`;
        const message = `"${sub.itemName}" expires on ${sub.expiryDate}. Please action renewal.`;
        const link    = `/dashboard/subscriptions/${sub.id}`;

        await db.collection("notifications").add({
          type: "subscription_expiring", title, message, link,
          read: false, targetRoles: TARGET_ROLES,
          createdAt: new Date().toISOString(), dedupeKey: dk,
        });

        if (tokens.length > 0) await sendPushToTokens(tokens, { title, body: message, link });
        if (emails.length > 0) await sendEmail(emails, title, subscriptionAlertEmail(title, message, link));

        sent++;
      }
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[cron/subscriptions] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
