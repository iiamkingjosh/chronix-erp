import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendPushToTokens } from "@/lib/push-service";
import { sendEmail, taxReminderEmail } from "@/lib/email-service";

function isCronRequest(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return !!secret && secret === process.env.CRON_SECRET;
}

interface Reminder {
  type:        string;
  title:       string;
  message:     string;
  link:        string;
  targetRoles: string[];
  dedupeKey:   string;
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const db     = getAdminDb();
    const now    = new Date();
    const day    = now.getDate();
    const month  = String(now.getMonth() + 1).padStart(2, "0");
    const year   = now.getFullYear();
    const period = `${year}-${month}`;

    const reminders: Reminder[] = [];

    /* VAT — reminder on 18th, deadline on 21st */
    if (day === 18) {
      reminders.push({
        type:        "renewal_due",
        title:       "VAT Filing Due in 3 Days",
        message:     `VAT filing for ${period} is due on the 21st. Review your VAT summary and prepare your FIRS submission.`,
        link:        "/dashboard/tax/vat",
        targetRoles: ["CEO", "CFO"],
        dedupeKey:   `vat-reminder-${period}`,
      });
    }
    if (day === 21) {
      reminders.push({
        type:        "renewal_due",
        title:       "VAT Filing Due Today",
        message:     `VAT filing for ${period} is due today (21st). Ensure your submission to FIRS is complete.`,
        link:        "/dashboard/tax/vat",
        targetRoles: ["CEO", "CFO"],
        dedupeKey:   `vat-deadline-${period}`,
      });
      /* WHT also due 21st */
      reminders.push({
        type:        "renewal_due",
        title:       "WHT Remittance Due Today",
        message:     `Withholding tax deducted for ${period} must be remitted to FIRS today (21st).`,
        link:        "/dashboard/tax/wht",
        targetRoles: ["CEO", "CFO"],
        dedupeKey:   `wht-deadline-${period}`,
      });
    }

    /* PAYE — reminder on 8th, deadline on 10th */
    if (day === 8) {
      reminders.push({
        type:        "renewal_due",
        title:       "PAYE Remittance Due in 2 Days",
        message:     `PAYE remittance for ${period} is due on the 10th. Ensure payroll is finalised and PAYE is computed.`,
        link:        "/dashboard/tax/paye",
        targetRoles: ["CEO", "CFO", "HR"],
        dedupeKey:   `paye-reminder-${period}`,
      });
    }
    if (day === 10) {
      reminders.push({
        type:        "renewal_due",
        title:       "PAYE Remittance Due Today",
        message:     `PAYE remittance for ${period} is due today (10th). Remit to LIRS/SIRS before end of business.`,
        link:        "/dashboard/tax/paye",
        targetRoles: ["CEO", "CFO", "HR"],
        dedupeKey:   `paye-deadline-${period}`,
      });
    }

    /* Annual CIT — fire on January 2nd */
    if (now.getMonth() === 0 && day === 2) {
      reminders.push({
        type:        "renewal_due",
        title:       "Annual CIT Review — New Financial Year",
        message:     `CIT returns for FY ${year - 1} must be filed within 6 months of your financial year end. Engage your tax practitioner now.`,
        link:        "/dashboard/tax/corporate",
        targetRoles: ["CEO", "CFO"],
        dedupeKey:   `annual-cit-${year - 1}`,
      });
    }

    /* Annual PAYE return — fire on January 25th */
    if (now.getMonth() === 0 && day === 25) {
      reminders.push({
        type:        "renewal_due",
        title:       "Annual PAYE Return Due — 31 January",
        message:     `Annual PAYE employer return for ${year - 1} is due by 31 January ${year}. File with your State Internal Revenue Service.`,
        link:        "/dashboard/tax/paye",
        targetRoles: ["CEO", "CFO", "HR"],
        dedupeKey:   `annual-paye-${year - 1}`,
      });
    }

    if (!reminders.length) return NextResponse.json({ sent: 0, period });

    /* Fetch target users once */
    const allRoles  = [...new Set(reminders.flatMap((r) => r.targetRoles))];
    const usersSnap = await db.collection("users").get();
    const usersByRole = new Map<string, { email: string; fcmTokens?: string[] }[]>();
    usersSnap.docs.forEach((d) => {
      const u = d.data() as { email: string; role: string; fcmTokens?: string[] };
      if (allRoles.includes(u.role)) {
        const arr = usersByRole.get(u.role) ?? [];
        arr.push(u);
        usersByRole.set(u.role, arr);
      }
    });

    let sent = 0;

    for (const reminder of reminders) {
      /* Dedup check */
      const existing = await db.collection("notifications")
        .where("dedupeKey", "==", reminder.dedupeKey).limit(1).get();
      if (!existing.empty) continue;

      /* Write in-app notification */
      await db.collection("notifications").add({
        type:        reminder.type,
        title:       reminder.title,
        message:     reminder.message,
        link:        reminder.link,
        read:        false,
        targetRoles: reminder.targetRoles,
        createdAt:   now.toISOString(),
        dedupeKey:   reminder.dedupeKey,
      });

      const users  = reminder.targetRoles.flatMap((r) => usersByRole.get(r) ?? []);
      const tokens = users.flatMap((u) => u.fcmTokens ?? []);
      const emails = [...new Set(users.map((u) => u.email).filter(Boolean))];

      if (tokens.length > 0) {
        await sendPushToTokens(tokens, {
          title: reminder.title,
          body:  reminder.message,
          link:  reminder.link,
        });
      }
      if (emails.length > 0) {
        await sendEmail(
          emails,
          reminder.title,
          taxReminderEmail(reminder.title, reminder.message, reminder.link),
        );
      }

      sent++;
    }

    return NextResponse.json({ sent, period });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
