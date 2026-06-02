import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";

function isCronRequest(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return !!secret && secret === process.env.CRON_SECRET;
}

const NOTIF_ROLES = ["Root Admin", "CEO", "System Admin"];

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const db    = getAdminDb();
    const today = new Date().toISOString().split("T")[0];

    const [leadsSnap, usersSnap] = await Promise.all([
      db.collection("leads").where("nextFollowUpDate", "<=", today).get(),
      db.collection("users").get(),
    ]);

    const usersMap = new Map(
      usersSnap.docs.map((d) => [d.id, d.data() as { email: string; role: string }])
    );

    const ptSnaps = await Promise.all(
      usersSnap.docs.map((d) => db.collection("push_tokens").doc(d.id).get())
    );
    const pushTokensByUid = new Map<string, string[]>(
      ptSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!.tokens ?? []])
    );

    const broadcastTokens = usersSnap.docs
      .filter((d) => NOTIF_ROLES.includes((d.data() as { role: string }).role))
      .flatMap((d) => pushTokensByUid.get(d.id) ?? []);

    let sent = 0;

    for (const leadDoc of leadsSnap.docs) {
      const lead = { ...leadDoc.data(), id: leadDoc.id } as {
        id: string; fullName: string; company?: string;
        stage: string; nextFollowUpDate?: string;
        assignedTo?: string;
      };

      if (!lead.nextFollowUpDate) continue;
      if (lead.stage === "client" || lead.stage === "retained") continue;

      const dk       = `follow-up-due-${lead.id}-${lead.nextFollowUpDate}`;
      const existing = await db.collection("notifications").where("dedupeKey", "==", dk).limit(1).get();
      if (!existing.empty) continue;

      const title   = "Follow-up Due";
      const message = `Follow-up with ${lead.fullName}${lead.company ? ` (${lead.company})` : ""} is due today.`;
      const link    = `/dashboard/crm/leads/${lead.id}`;

      const targetUids = new Set<string>();
      if (lead.assignedTo) targetUids.add(lead.assignedTo);

      await db.collection("notifications").add({
        type:        "follow_up_due",
        title,
        message,
        link,
        read:        false,
        targetRoles: NOTIF_ROLES,
        targetUids:  [...targetUids],
        createdAt:   new Date().toISOString(),
        dedupeKey:   dk,
      });

      const tokens = [...broadcastTokens];
      if (lead.assignedTo) {
        const assigneeTokens = pushTokensByUid.get(lead.assignedTo) ?? [];
        tokens.push(...assigneeTokens);
      }
      const uniqueTokens = [...new Set(tokens)];
      if (uniqueTokens.length > 0) await sendPushToTokens(uniqueTokens, { title, body: message, link });

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[cron/crm] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
