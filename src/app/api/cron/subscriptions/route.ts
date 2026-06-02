import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, subscriptionAlertEmail } from "@/lib/email-service";

function isCronRequest(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return !!secret && secret === process.env.CRON_SECRET;
}

const TARGET_ROLES = ["Root Admin", "CEO", "System Admin", "CFO"];

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

    const targetDocs = usersSnap.docs.filter((d) =>
      TARGET_ROLES.includes((d.data() as { role: string }).role)
    );
    const emails = [...new Set(targetDocs.map((d) => (d.data() as { email: string }).email).filter(Boolean))];
    const ptSnaps = await Promise.all(
      targetDocs.map((d) => db.collection("push_tokens").doc(d.id).get())
    );
    const tokens = ptSnaps.flatMap((s) => (s.exists ? (s.data()?.tokens ?? []) : []));

    let sent = 0;
    let invoicesCreated = 0;

    for (const subDoc of subsSnap.docs) {
      const sub = { ...subDoc.data(), id: subDoc.id } as {
        id: string; subId: string; itemName: string; expiryDate: string;
        cancelled: boolean; autoRemind: boolean;
        renewalCost: number; clientName: string;
        vatApplicable?: boolean;
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

        /* Auto-create a draft renewal invoice at the 7-day mark */
        if (band === 7 && (sub.renewalCost ?? 0) > 0) {
          const invDedupeKey = `sub-invoice-${sub.id}-${sub.expiryDate.slice(0, 7)}`;
          const existingInv  = await db.collection("invoices")
            .where("subscriptionDedupeKey", "==", invDedupeKey).limit(1).get();

          if (existingInv.empty) {
            const d    = now;
            const yy   = String(d.getFullYear()).slice(2);
            const mm   = String(d.getMonth() + 1).padStart(2, "0");
            const dd   = String(d.getDate()).padStart(2, "0");
            const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
            const invoiceNumber = `CT${yy}${mm}${dd}-${rand}`;
            const cost      = sub.renewalCost;
            const applyVat  = sub.vatApplicable !== false;
            const vatAmount = applyVat ? Math.round(cost * 0.075 * 100) / 100 : 0;
            const vatRate   = applyVat ? 0.075 : 0;
            const total     = Math.round((cost + vatAmount) * 100) / 100;
            const invoiceDate = d.toISOString().split("T")[0];

            const invRef = await db.collection("invoices").add({
              invoiceNumber,
              invoiceDate,
              dueDate:        sub.expiryDate,
              status:         "pending",
              approvalStatus: "draft",
              client:         { name: sub.clientName ?? "Unknown", address: "", phone: "" },
              salesperson:    "System",
              items: [{
                id: "1",
                name:      `${sub.itemName} — Subscription Renewal`,
                unitPrice: cost,
                quantity:  1,
                lineTotal: cost,
              }],
              subtotal:              cost,
              vatRate,
              vatAmount,
              total,
              notes:                 `Auto-generated renewal invoice for subscription ${sub.subId ?? sub.id}.`,
              subscriptionId:        sub.id,
              subscriptionDedupeKey: invDedupeKey,
              createdAt:             new Date().toISOString(),
              createdBy:             "cron",
            });

            // Post journal entry: DR 1100 AR / CR 4010 Revenue / CR 2100 VAT
            try {
              const prefix      = `${yy}${mm}${dd}`;
              const counterRef  = db.collection("metadata").doc(`journalCounter_${prefix}`);
              const jeNumber    = await db.runTransaction(async (tx) => {
                const cSnap = await tx.get(counterRef);
                if (!cSnap.exists) { tx.set(counterRef, { lastNumber: 1, date: prefix }); return 1; }
                const n = (cSnap.data()!.lastNumber as number) + 1;
                tx.update(counterRef, { lastNumber: n });
                return n;
              });
              const entryNumber = `JE${prefix}-${String(jeNumber).padStart(3, "0")}`;
              const now2        = new Date().toISOString();
              await db.collection("journal_entries").add({
                entryNumber,
                entryDate:     invoiceDate,
                description:   `Invoice ${invoiceNumber} — ${sub.clientName ?? "Unknown"} (auto)`,
                reference:     invoiceNumber,
                referenceType: "invoice",
                referenceId:   invRef.id,
                lineItems: [
                  { accountCode: "1100", accountName: "Accounts Receivable",           debit: total, credit: 0,         description: `Invoice to ${sub.clientName ?? "Unknown"}` },
                  { accountCode: "4010", accountName: "IT Consulting Services Revenue", debit: 0,     credit: cost,      description: `${sub.itemName} — Subscription Renewal` },
                  ...(vatAmount > 0 ? [{ accountCode: "2100", accountName: "VAT Payable (7.5%)", debit: 0, credit: vatAmount, description: "VAT 7.5% collected" }] : []),
                ],
                totalDebit:  total,
                totalCredit: total,
                status:      "posted",
                createdBy:   "cron",
                postedBy:    "cron",
                postedAt:    now2,
                createdAt:   now2,
              });
            } catch (jeErr) {
              console.error("[cron/subscriptions] journal entry failed for invoice", invRef.id, jeErr);
              await invRef.update({ _journalError: String(jeErr) }).catch(() => {});
            }

            invoicesCreated++;
          }
        }
      }
    }

    return NextResponse.json({ sent, invoicesCreated });
  } catch (err) {
    console.error("[cron/subscriptions] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
