import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";

function isCronRequest(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return !!secret && secret === process.env.CRON_SECRET;
}

const TARGET_ROLES = ["Root Admin", "CEO", "CFO", "System Admin"];

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const db    = getAdminDb();
    const today = new Date().toISOString().split("T")[0];

    const [invSnap, usersSnap] = await Promise.all([
      db.collection("invoices").where("status", "==", "pending").get(),
      db.collection("users").get(),
    ]);

    const targetUids = usersSnap.docs
      .filter((d) => TARGET_ROLES.includes((d.data() as { role: string }).role))
      .map((d) => d.id);
    const ptSnaps = await Promise.all(
      targetUids.map((id) => db.collection("push_tokens").doc(id).get())
    );
    const tokens = ptSnaps.flatMap((s) => (s.exists ? (s.data()?.tokens ?? []) : []));

    let sent = 0;

    for (const invDoc of invSnap.docs) {
      const inv = { ...invDoc.data(), id: invDoc.id } as {
        id: string; invoiceNumber: string; dueDate: string;
        client: { name: string };
      };

      if (!inv.dueDate || inv.dueDate >= today) continue;

      const dk       = `inv-overdue-${inv.id}`;
      const existing = await db.collection("notifications").where("dedupeKey", "==", dk).limit(1).get();
      if (!existing.empty) continue;

      const title   = "Invoice Overdue";
      const message = `Invoice ${inv.invoiceNumber} for ${inv.client?.name ?? "client"} is past its due date.`;
      const link    = `/dashboard/finance/invoices/${inv.id}`;

      await db.collection("notifications").add({
        type: "invoice_overdue", title, message, link,
        read: false, targetRoles: TARGET_ROLES,
        createdAt: new Date().toISOString(), dedupeKey: dk,
      });

      if (tokens.length > 0) await sendPushToTokens(tokens, { title, body: message, link });

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[cron/invoices] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
