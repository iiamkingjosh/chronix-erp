import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Ticket, TicketNote, TicketStatus } from "@/types/tickets";
import { STATUS_LABELS, defaultSlaDeadline } from "@/types/tickets";
import { notifyAssignment } from "@/lib/notifications-service";
import { hasPermission } from "@/types/roles";
import { logAuditEvent } from "@/lib/audit-service";

const TKT = "tickets";
const USR = "users";

/** D4 (hard enforcement): slaDeadline is always computed server-side from
 * priority via defaultSlaDeadline() - any client-submitted value is
 * ignored, not merely overwritten by a default the caller could still
 * have tampered with. The only way to set a deadline that diverges from
 * the priority's nominal target is overrideSlaDeadline() below, which is
 * manager-gated and requires a logged reason. */
export async function createTicket(data: Omit<Ticket, "id">): Promise<Ticket> {
  const final = { ...data, slaDeadline: defaultSlaDeadline(data.priority, new Date(data.createdAt)) };
  const ref = await addDoc(collection(db, TKT), final);
  return { ...final, id: ref.id };
}

/** Manager-only override of a ticket's SLA deadline after creation -
 * the one sanctioned way to diverge from the priority's nominal target.
 * Function-level permission gate independent of firestore.rules (same
 * defense-in-depth pattern as updateEmployeeSalary) - don't rely on the
 * rule alone. Requires a reason, same required-reason convention as the
 * Payslip salary-update feature. */
export async function overrideSlaDeadline(
  ticketId: string,
  newDeadline: string,
  reason: string,
  actorUid: string,
): Promise<void> {
  if (!reason.trim()) {
    throw new Error("A reason is required to override a ticket's SLA deadline.");
  }

  const [ticketSnap, actorSnap] = await Promise.all([
    getDoc(doc(db, TKT, ticketId)),
    getDoc(doc(db, USR, actorUid)),
  ]);
  if (!ticketSnap.exists()) {
    throw new Error("Ticket not found.");
  }

  const actorData = actorSnap.data() as Record<string, unknown> | undefined;
  const actorRole = (actorData?.role ?? "") as string;
  if (!hasPermission(actorRole, "manage:tickets")) {
    throw new Error("You do not have permission to override a ticket's SLA deadline.");
  }

  const ticketData  = ticketSnap.data() as Ticket;
  const oldDeadline = ticketData.slaDeadline;
  const actorName   = (actorData?.displayName ?? actorData?.email ?? actorUid) as string;
  const now         = new Date().toISOString();

  await updateDoc(doc(db, TKT, ticketId), {
    slaDeadline:       newDeadline,
    slaOverrideReason: reason.trim(),
    slaOverriddenBy:   actorName,
    slaOverriddenAt:   now,
    updatedAt:         now,
  });

  await logAuditEvent({
    actorUid, actorName, actorRole,
    action:    "update",
    module:    "tickets",
    entityId:  ticketId,
    entityRef: ticketData.ticketId,
    details:   `SLA deadline overridden for ${ticketData.ticketId}: ${oldDeadline} → ${newDeadline}. Reason: ${reason.trim()}`,
    timestamp: now,
  });
}

export async function getTickets(): Promise<Ticket[]> {
  const snap = await getDocs(query(collection(db, TKT), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const snap = await getDoc(doc(db, TKT, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Ticket) : null;
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  author: { uid: string; name: string }
): Promise<void> {
  const now: string = new Date().toISOString();
  const note: TicketNote = {
    id:         crypto.randomUUID(),
    authorUid:  author.uid,
    authorName: author.name,
    content:    `Status changed to ${STATUS_LABELS[status]}`,
    type:       "status_change",
    createdAt:  now,
  };
  const updates: Record<string, unknown> = {
    status,
    updatedAt: now,
    notes: arrayUnion(note),
  };
  if (status === "resolved") updates.resolvedAt = now;
  if (status === "closed")   updates.closedAt   = now;
  await updateDoc(doc(db, TKT, ticketId), updates);
}

export async function addTicketNote(
  ticketId: string,
  note: TicketNote
): Promise<void> {
  await updateDoc(doc(db, TKT, ticketId), {
    notes:     arrayUnion(note),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateClientFeedback(
  ticketId: string,
  feedback: string
): Promise<void> {
  await updateDoc(doc(db, TKT, ticketId), {
    clientFeedback: feedback,
    updatedAt: new Date().toISOString(),
  });
}

export async function reassignTicket(
  ticketId: string,
  assignedTo: string,
  assignedName: string,
  author: { uid: string; name: string }
): Promise<void> {
  const note: TicketNote = {
    id:         crypto.randomUUID(),
    authorUid:  author.uid,
    authorName: author.name,
    content:    `Ticket reassigned to ${assignedName}`,
    type:       "assignment",
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, TKT, ticketId), {
    assignedTo,
    assignedName,
    updatedAt: new Date().toISOString(),
    notes:     arrayUnion(note),
  });

  notifyAssignment({
    type:         "ticket_assigned",
    title:        "Ticket Assigned to You",
    message:      `A support ticket has been reassigned to you by ${author.name}.`,
    link:         `/dashboard/tickets/${ticketId}`,
    assigneeUid:  assignedTo,
    assigneeName: assignedName,
    dedupeKey:    `ticket-assigned-${ticketId}-${assignedTo}-${Date.now()}`,
  }).catch(() => {});
}

export interface StaffMember {
  uid: string;
  displayName: string;
  email: string;
  role: string;
}

export async function getStaffList(): Promise<StaffMember[]> {
  const snap = await getDocs(collection(db, USR));
  return snap.docs.map((d) => ({
    uid:         d.id,
    displayName: (d.data().displayName as string) || (d.data().email as string),
    email:       (d.data().email as string) || "",
    role:        d.data().role as string,
  }));
}

export async function getOpenTicketsWithSLA(): Promise<Ticket[]> {
  const snap = await getDocs(
    query(
      collection(db, TKT),
      where("status", "in", ["open", "in_progress"]),
      orderBy("slaDeadline", "asc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
}

/** Feeds the SLA dashboard's avgResolution/complianceRate - previously a
 * hardcoded empty array (D3), so those metrics were dead constants
 * (0h / 100%) regardless of real ticket history. A ticket closed without
 * ever passing through "resolved" has no resolvedAt - the dashboard's own
 * math already filters those out rather than crashing, so no change
 * needed there, only this real data source. */
export async function getResolvedTicketsWithSLA(): Promise<Ticket[]> {
  const snap = await getDocs(
    query(collection(db, TKT), where("status", "in", ["resolved", "closed"]))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
}

export async function escalateTicket(
  ticketId: string,
  level: 1 | 2 | 3,
  escalatedTo: string,
  reason: string,
  author: { uid: string; name: string }
): Promise<void> {
  const note: TicketNote = {
    id:         crypto.randomUUID(),
    authorUid:  author.uid,
    authorName: author.name,
    content:    `Ticket escalated to L${level} (${escalatedTo}): ${reason}`,
    type:       "assignment",
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, TKT, ticketId), {
    escalatedAt:      new Date().toISOString(),
    escalatedTo,
    escalationLevel:  level,
    escalationReason: reason,
    updatedAt:        new Date().toISOString(),
    notes:            arrayUnion(note),
  });
}
