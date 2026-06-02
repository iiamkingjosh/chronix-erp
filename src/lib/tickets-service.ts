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
import { STATUS_LABELS } from "@/types/tickets";

const TKT = "tickets";
const USR = "users";

export async function createTicket(data: Omit<Ticket, "id">): Promise<Ticket> {
  const ref = await addDoc(collection(db, TKT), data);
  return { ...data, id: ref.id };
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
    id:         Date.now().toString(),
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
    id:         Date.now().toString(),
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

export async function escalateTicket(
  ticketId: string,
  level: 1 | 2 | 3,
  escalatedTo: string,
  reason: string,
  author: { uid: string; name: string }
): Promise<void> {
  const note: TicketNote = {
    id:         Date.now().toString(),
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
