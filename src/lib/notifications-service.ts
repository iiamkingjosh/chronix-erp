import {
  collection, addDoc, getDocs, updateDoc,
  query, orderBy, where, doc, writeBatch,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import type { AppNotification, NotificationType } from "@/types/notifications";

const NOTIF = "notifications";

/** Push delivery for the in-app notification just written - best-effort,
 * never throws past the caller. Checks the response and logs the real
 * reason on failure rather than swallowing it via a bare .catch(() => {}) -
 * the same pattern fixed today in send-password-reset, cron/subscriptions,
 * notifications/send, and cron/tax. */
async function sendPushBestEffort(data: Omit<AppNotification, "id">): Promise<void> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    const res = await fetch("/api/notifications/push", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        title:       data.title,
        message:     data.message,
        link:        data.link,
        targetUids:  data.targetUids,
        targetRoles: data.targetRoles,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[createNotification] push failed:", res.status, body.error ?? body);
    }
  } catch (err) {
    console.error("[createNotification] push failed:", err);
  }
}

export async function createNotification(
  data: Omit<AppNotification, "id">
): Promise<void> {
  if (data.dedupeKey) {
    const existing = await getDocs(
      query(collection(db, NOTIF), where("dedupeKey", "==", data.dedupeKey))
    );
    if (!existing.empty) return;
  }
  await addDoc(collection(db, NOTIF), data);
  await sendPushBestEffort(data);
}

export async function getNotifications(role: string, uid: string): Promise<AppNotification[]> {
  const snap = await getDocs(
    query(collection(db, NOTIF), orderBy("createdAt", "desc"))
  );
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
  return all.filter(
    (n) =>
      n.targetRoles.includes(role) ||
      n.targetRoles.includes("all") ||
      (n.targetUids ?? []).includes(uid)
  );
}

export async function markRead(id: string): Promise<void> {
  await updateDoc(doc(db, NOTIF, id), { read: true });
}

export async function markAllRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, NOTIF, id), { read: true }));
  await batch.commit();
}

export async function notifyAssignment(params: {
  type:         NotificationType;
  title:        string;
  message:      string;
  link:         string;
  assigneeUid:  string;
  assigneeName: string;
  dedupeKey:    string;
  extraRoles?:  string[];
}): Promise<void> {
  await createNotification({
    type:        params.type,
    title:       params.title,
    message:     params.message,
    link:        params.link,
    read:        false,
    targetRoles: params.extraRoles ?? [],
    targetUids:  [params.assigneeUid],
    createdAt:   new Date().toISOString(),
    dedupeKey:   params.dedupeKey,
  });
}

/* ── Automation helpers ───────────────────────────────────── */

export async function notifySubscriptionExpiring(
  sub: { id: string; itemName: string; expiryDate: string },
  daysBand: 60 | 30 | 7 | 1
): Promise<void> {
  await createNotification({
    type:        "subscription_expiring",
    title:       `Subscription expiring in ${daysBand} day${daysBand === 1 ? "" : "s"}`,
    message:     `"${sub.itemName}" expires on ${sub.expiryDate}. Please action renewal.`,
    link:        `/dashboard/subscriptions/${sub.id}`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "System Admin", "CFO"],
    createdAt:   new Date().toISOString(),
    dedupeKey:   `sub-expiry-${sub.id}-${daysBand}d`,
  });
}

export async function notifyInvoiceOverdue(
  inv: { id: string; invoiceNumber: string; clientName: string }
): Promise<void> {
  await createNotification({
    type:        "invoice_overdue",
    title:       "Invoice Overdue",
    message:     `Invoice ${inv.invoiceNumber} for ${inv.clientName} is past its due date.`,
    link:        `/dashboard/finance/invoices/${inv.id}`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "CFO", "System Admin"],
    createdAt:   new Date().toISOString(),
    dedupeKey:   `inv-overdue-${inv.id}`,
  });
}

export async function notifyNewLead(
  lead: { id: string; fullName: string; company: string }
): Promise<void> {
  await createNotification({
    type:        "new_lead",
    title:       "New Lead Added",
    message:     `${lead.fullName}${lead.company ? ` (${lead.company})` : ""} has been added as a lead.`,
    link:        `/dashboard/crm/leads/${lead.id}`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "System Admin", "Brand Lead", "Social Media Lead"],
    createdAt:   new Date().toISOString(),
  });
}

export async function notifyMilestoneComplete(
  project: { id: string; name: string },
  milestone: { title: string }
): Promise<void> {
  await createNotification({
    type:        "milestone_complete",
    title:       "Milestone Completed",
    message:     `Milestone "${milestone.title}" completed in project "${project.name}".`,
    link:        `/dashboard/projects/${project.id}`,
    read:        false,
    targetRoles: ["Root Admin", "CEO", "System Admin"],
    createdAt:   new Date().toISOString(),
  });
}

export async function checkSubscriptionReminders(
  subs: Array<{ id: string; itemName: string; expiryDate: string; cancelled: boolean; autoRemind: boolean }>
): Promise<void> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const sub of subs) {
    if (sub.cancelled || !sub.autoRemind) continue;
    const expiry = new Date(sub.expiryDate + "T00:00:00");
    const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);

    for (const band of [60, 30, 7, 1] as const) {
      if (days === band) {
        await notifySubscriptionExpiring(sub, band);
      }
    }
  }
}

export async function checkInvoiceOverdue(
  invoices: Array<{ id: string; invoiceNumber: string; client: { name: string }; dueDate: string; status: string }>
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  for (const inv of invoices) {
    if (inv.status === "pending" && inv.dueDate < today) {
      await notifyInvoiceOverdue({
        id:            inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName:    inv.client.name,
      });
    }
  }
}

/* ── Tax Filing Reminders ─────────────────────────────────── */

export async function checkTaxFilingReminders(): Promise<void> {
  const now    = new Date();
  const day    = now.getDate();
  const month  = String(now.getMonth() + 1).padStart(2, "0");
  const year   = now.getFullYear();
  const period = `${year}-${month}`;

  /* VAT filing — 21st of every month */
  if (day === 21) {
    await createNotification({
      type:        "renewal_due",
      title:       "VAT Filing Due Today",
      message:     `VAT filing for ${period} is due today (21st). Ensure FIRS submission is complete. Check VAT page for payable amount.`,
      link:        "/dashboard/tax/vat",
      read:        false,
      targetRoles: ["Root Admin", "CEO", "CFO"],
      createdAt:   now.toISOString(),
      dedupeKey:   `vat-filing-${period}`,
    });
  }

  /* PAYE remittance — 10th of every month */
  if (day === 10) {
    await createNotification({
      type:        "renewal_due",
      title:       "PAYE Remittance Due Today",
      message:     `PAYE remittance for ${period} is due today (10th). Ensure remittance to LIRS/SIRS is complete.`,
      link:        "/dashboard/tax/paye",
      read:        false,
      targetRoles: ["Root Admin", "CEO", "CFO", "HR"],
      createdAt:   now.toISOString(),
      dedupeKey:   `paye-filing-${period}`,
    });
  }

  /* Annual CIT reminder — first week of January */
  if (now.getMonth() === 0 && day <= 7) {
    await createNotification({
      type:        "renewal_due",
      title:       "Annual Tax Review — New Financial Year",
      message:     `It is ${year}. Corporate tax returns for FY ${year - 1} should be reviewed. Consult your tax practitioner.`,
      link:        "/dashboard/tax/corporate",
      read:        false,
      targetRoles: ["Root Admin", "CEO", "CFO"],
      createdAt:   now.toISOString(),
      dedupeKey:   `annual-cit-${year - 1}`,
    });
  }

  /* Annual PAYE return — January 31 reminder */
  if (now.getMonth() === 0 && day >= 25 && day <= 31) {
    await createNotification({
      type:        "renewal_due",
      title:       "Annual PAYE Return Due — 31 January",
      message:     `Annual PAYE employer return for ${year - 1} is due by 31 January ${year}. File with your State Internal Revenue Service.`,
      link:        "/dashboard/tax/paye",
      read:        false,
      targetRoles: ["Root Admin", "CEO", "CFO", "HR"],
      createdAt:   now.toISOString(),
      dedupeKey:   `annual-paye-${year - 1}`,
    });
  }
}
