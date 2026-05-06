import {
  collection, addDoc, getDocs, updateDoc,
  query, orderBy, where, doc, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppNotification } from "@/types/notifications";

const NOTIF = "notifications";

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
}

export async function getNotifications(role: string): Promise<AppNotification[]> {
  const snap = await getDocs(
    query(collection(db, NOTIF), orderBy("createdAt", "desc"))
  );
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
  return all.filter(
    (n) => n.targetRoles.includes(role) || n.targetRoles.includes("all")
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
    targetRoles: ["CEO", "System Admin", "CFO"],
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
    targetRoles: ["CEO", "CFO"],
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
    targetRoles: ["CEO", "Brand Lead", "Social Media Lead"],
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
    targetRoles: ["CEO", "System Admin"],
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
