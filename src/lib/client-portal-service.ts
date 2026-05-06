import {
  collection, getDocs, query, where, addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Invoice } from "@/types/finance";
import type { Ticket } from "@/types/tickets";
import type { Subscription } from "@/types/subscriptions";
import type { Client } from "@/types/crm";
import type { TicketPriority } from "@/types/tickets";
import { defaultSlaDeadline, generateTicketId } from "@/types/tickets";

function sortByDateDesc<T>(items: T[], getIso: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => {
    const ad = new Date(getIso(a) ?? 0).getTime();
    const bd = new Date(getIso(b) ?? 0).getTime();
    return bd - ad;
  });
}

export async function getClientByEmail(email: string): Promise<Client | null> {
  const snap = await getDocs(
    query(collection(db, "clients"), where("email", "==", email))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Client;
}

export async function getPortalInvoices(clientName: string): Promise<Invoice[]> {
  const snap = await getDocs(
    query(collection(db, "invoices"), where("client.name", "==", clientName))
  );
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
  return sortByDateDesc(invoices, (inv) => inv.createdAt);
}

export async function getPortalTickets(clientName: string): Promise<Ticket[]> {
  const snap = await getDocs(
    query(collection(db, "tickets"), where("client.name", "==", clientName))
  );
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
  return sortByDateDesc(tickets, (t) => t.createdAt);
}

export async function getPortalSubscriptions(clientName: string): Promise<Subscription[]> {
  const snap = await getDocs(
    query(
      collection(db, "subscriptions"),
      where("clientName", "==", clientName),
      where("cancelled", "==", false)
    )
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Subscription))
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

export async function submitPortalTicket(data: {
  clientName: string;
  clientContact: string;
  title: string;
  description: string;
  priority: TicketPriority;
  createdBy: string;
}): Promise<string> {
  const now  = new Date().toISOString();
  const ref = await addDoc(collection(db, "tickets"), {
    ticketId:     generateTicketId(),
    client:       { name: data.clientName, contact: data.clientContact },
    title:        data.title,
    description:  data.description,
    priority:     data.priority,
    status:       "open",
    assignedTo:   "",
    assignedName: "Unassigned",
    slaDeadline:  defaultSlaDeadline(data.priority),
    notes:        [],
    createdAt:    now,
    createdBy:    data.createdBy,
    updatedAt:    now,
  });
  return ref.id;
}
