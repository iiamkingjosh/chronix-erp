import {
  collection, getDocs, query, where, addDoc, doc, updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Invoice } from "@/types/finance";
import type { Ticket } from "@/types/tickets";
import type { Subscription } from "@/types/subscriptions";
import type { Client } from "@/types/crm";
import type { TicketPriority } from "@/types/tickets";
import { defaultSlaDeadline, generateTicketId } from "@/types/tickets";
import type { ChronixUser } from "@/types/roles";
import { fetchUserProfile } from "@/lib/auth-service";

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

/** D5 root cause: nothing in the app has ever set portalBillingCompany/
 * portalBillingName/portalBillingEmail (confirmed - searched the whole
 * codebase, only firestore.rules and docs/tests reference them). The
 * moment a matching Client record is found by email, we know it's the
 * right one - self-heal the user's own doc so future reads gated by
 * userPortalBillingMatches() succeed. Best-effort by design (callers
 * shouldn't let a failed self-heal block portal access). */
async function selfHealPortalBillingFields(uid: string, client: Client): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    portalBillingCompany: client.company,
    portalBillingName:    client.fullName,
    portalBillingEmail:   client.email,
    updatedAt:             new Date().toISOString(),
  });
}

export type ClientPortalErrorKind = "none" | "denied" | "network";

export interface ClientPortalState {
  profile:      ChronixUser | null;
  clientRecord: Client | null;
  errorKind:    ClientPortalErrorKind;
}

function classifyError(err: unknown): ClientPortalErrorKind {
  return (err as { code?: string } | undefined)?.code === "permission-denied" ? "denied" : "network";
}

/** The testable seam D7 was missing - all of ClientAuthContext's loading
 * logic, extracted into a plain function with no React dependency, that
 * classifies what it catches instead of a bare catch-all collapsing
 * everything to "you have nothing". A canary read of invoices (the exact
 * collection gated by userPortalBillingMatches() - see D5) surfaces a
 * real permission-denied here, at load time, rather than leaving each
 * portal page to separately rediscover it. */
export async function loadClientPortalState(user: User): Promise<ClientPortalState> {
  let profile: ChronixUser;
  try {
    profile = await fetchUserProfile(user);
  } catch (err) {
    return { profile: null, clientRecord: null, errorKind: classifyError(err) };
  }

  if (profile.role !== "Client") {
    return { profile, clientRecord: null, errorKind: "none" };
  }

  let clientRecord: Client | null;
  try {
    clientRecord = await getClientByEmail(user.email ?? "");
  } catch (err) {
    return { profile, clientRecord: null, errorKind: classifyError(err) };
  }

  if (!clientRecord) {
    return { profile, clientRecord: null, errorKind: "none" };
  }

  try {
    await selfHealPortalBillingFields(user.uid, clientRecord);
  } catch {
    /* best-effort - a failed self-heal write must never block portal access */
  }

  try {
    // Name-only, deliberately - the invoices read rule gates on
    // resource.data.client.name specifically (userPortalBillingMatches()),
    // not client.id. Passing a clientId here would also trigger
    // getPortalInvoices()'s second (by-id) query, which filters on a
    // field the rule never checks - Firestore can't statically prove
    // that query satisfies the rule, so it rejects it unconditionally,
    // regardless of portalBillingCompany being correct. Confirmed by
    // testing directly: the canary failed even with a verified-correct
    // self-heal and a genuinely matching invoice, until the clientId
    // argument was removed. A real, separate gap in getPortalInvoices()
    // itself (the by-id path is unusable for any Client-role caller as
    // currently written) - out of scope for D5/D7, not fixed here.
    await getPortalInvoices(clientRecord.company || clientRecord.fullName);
  } catch (err) {
    return { profile, clientRecord, errorKind: classifyError(err) };
  }

  return { profile, clientRecord, errorKind: "none" };
}

export async function getPortalInvoices(clientName: string, clientId?: string): Promise<Invoice[]> {
  const normalised = clientName.toLowerCase().trim();
  const [byName, byId] = await Promise.all([
    getDocs(query(collection(db, "invoices"), where("client.name", "==", clientName))),
    clientId
      ? getDocs(query(collection(db, "invoices"), where("client.id", "==", clientId)))
      : Promise.resolve(null),
  ]);
  const seen = new Set<string>();
  const invoices: Invoice[] = [];
  for (const snap of [byName, byId]) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (!seen.has(d.id)) { seen.add(d.id); invoices.push({ id: d.id, ...d.data() } as Invoice); }
    }
  }
  return sortByDateDesc(
    invoices.filter((inv) =>
      (inv.client as { name?: string })?.name?.toLowerCase().trim() === normalised ||
      (inv.client as { id?: string })?.id === clientId
    ),
    (inv) => inv.createdAt,
  );
}

export async function getPortalTickets(clientName: string, clientId?: string): Promise<Ticket[]> {
  const normalised = clientName.toLowerCase().trim();
  const [byName, byId] = await Promise.all([
    getDocs(query(collection(db, "tickets"), where("client.name", "==", clientName))),
    clientId
      ? getDocs(query(collection(db, "tickets"), where("client.id", "==", clientId)))
      : Promise.resolve(null),
  ]);
  const seen = new Set<string>();
  const tickets: Ticket[] = [];
  for (const snap of [byName, byId]) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (!seen.has(d.id)) { seen.add(d.id); tickets.push({ id: d.id, ...d.data() } as Ticket); }
    }
  }
  return sortByDateDesc(
    tickets.filter((t) =>
      (t.client as { name?: string })?.name?.toLowerCase().trim() === normalised ||
      (t.client as { id?: string })?.id === clientId
    ),
    (t) => t.createdAt,
  );
}

export async function getPortalSubscriptions(clientName: string, clientId?: string): Promise<Subscription[]> {
  const normalised = clientName.toLowerCase().trim();
  const [byName, byId] = await Promise.all([
    getDocs(query(collection(db, "subscriptions"), where("clientName", "==", clientName), where("cancelled", "==", false))),
    clientId
      ? getDocs(query(collection(db, "subscriptions"), where("clientId", "==", clientId), where("cancelled", "==", false)))
      : Promise.resolve(null),
  ]);
  const seen = new Set<string>();
  const subs: Subscription[] = [];
  for (const snap of [byName, byId]) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (!seen.has(d.id)) { seen.add(d.id); subs.push({ id: d.id, ...d.data() } as Subscription); }
    }
  }
  return subs
    .filter((s) => {
      const sClientId = (s as { clientId?: string }).clientId;
      // clientId is the authoritative link going forward — only trust an
      // id-only match (excluding any stale/coincidental name match) when
      // BOTH sides actually have one to compare. If either the record
      // predates this field, or the caller doesn't have a resolved
      // clientId to pass in, fall back to the exact clientName match.
      if (sClientId && clientId) return sClientId === clientId;
      return (s as { clientName?: string }).clientName?.toLowerCase().trim() === normalised;
    })
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
