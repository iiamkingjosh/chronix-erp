import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Lead, Client, LeadStage, ActivityEntry,
  FollowUp,
} from "@/types/crm";
import { STAGE_LABELS, generateClientId } from "@/types/crm";
import { getStaffList, type StaffMember } from "./tickets-service";
import { notifyAssignment } from "@/lib/notifications-service";

const LEADS   = "leads";
const CLIENTS = "clients";

/* ── Leads ──────────────────────────────────────── */

export async function createLead(data: Omit<Lead, "id">): Promise<Lead> {
  const ref = await addDoc(collection(db, LEADS), data);
  return { ...data, id: ref.id };
}

export async function getLeads(): Promise<Lead[]> {
  const snap = await getDocs(query(collection(db, LEADS), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getLead(id: string): Promise<Lead | null> {
  const snap = await getDoc(doc(db, LEADS, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Lead) : null;
}

export async function assignLead(
  leadId: string,
  assignedTo: string,
  assignedName: string,
  lead: { fullName: string; company: string },
  author: { uid: string; name: string }
): Promise<void> {
  const entry: ActivityEntry = {
    id:         crypto.randomUUID(),
    type:       "stage_change",
    content:    `Lead reassigned to ${assignedName}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, LEADS, leadId), {
    assignedTo,
    assignedName,
    updatedAt: new Date().toISOString(),
    activity:  arrayUnion(entry),
  });

  notifyAssignment({
    type:         "lead_assigned",
    title:        "Lead Assigned to You",
    message:      `Lead "${lead.fullName}"${lead.company ? ` (${lead.company})` : ""} has been assigned to you.`,
    link:         `/dashboard/crm/leads/${leadId}`,
    assigneeUid:  assignedTo,
    assigneeName: assignedName,
    dedupeKey:    `lead-assigned-${leadId}-${assignedTo}`,
    extraRoles:   ["Root Admin", "CEO"],
  }).catch(() => {});
}

export async function updateLeadStage(
  leadId: string,
  stage: LeadStage,
  author: { uid: string; name: string }
): Promise<void> {
  const entry: ActivityEntry = {
    id:         crypto.randomUUID(),
    type:       "stage_change",
    content:    `Moved to ${STAGE_LABELS[stage]}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, LEADS, leadId), {
    stage,
    updatedAt: new Date().toISOString(),
    activity:  arrayUnion(entry),
  });
}

export async function addLeadActivity(
  leadId: string,
  entry: ActivityEntry
): Promise<void> {
  await updateDoc(doc(db, LEADS, leadId), {
    activity:  arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
}

export async function addFollowUp(
  leadId: string,
  followUp: FollowUp,
  author: { uid: string; name: string }
): Promise<void> {
  const entry: ActivityEntry = {
    id:         crypto.randomUUID(),
    type:       "follow_up",
    content:    `Follow-up scheduled for ${followUp.date}${followUp.notes ? `: ${followUp.notes}` : ""}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, LEADS, leadId), {
    followUps:         arrayUnion(followUp),
    nextFollowUpDate:  followUp.date,
    activity:          arrayUnion(entry),
    updatedAt:         new Date().toISOString(),
  });
}

export async function completeFollowUp(
  leadId: string,
  followUpId: string,
  currentFollowUps: FollowUp[],
  author: { uid: string; name: string }
): Promise<void> {
  const now = new Date().toISOString();
  const updated = currentFollowUps.map((f) =>
    f.id === followUpId ? { ...f, completedAt: now } : f
  );
  const next = updated
    .filter((f) => !f.completedAt)
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;

  const entry: ActivityEntry = {
    id:         crypto.randomUUID(),
    type:       "follow_up_done",
    content:    "Follow-up marked as completed",
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  now,
  };
  await updateDoc(doc(db, LEADS, leadId), {
    followUps:        updated,
    nextFollowUpDate: next ?? null,
    activity:         arrayUnion(entry),
    updatedAt:        now,
  });
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<void> {
  await updateDoc(doc(db, LEADS, leadId), { notes, updatedAt: new Date().toISOString() });
}

export async function convertToClient(
  lead: Lead,
  author: { uid: string; name: string }
): Promise<Client> {
  const now = new Date().toISOString();
  const clientData: Omit<Client, "id"> = {
    clientId:      generateClientId(),
    fullName:      lead.fullName,
    company:       lead.company,
    email:         lead.email,
    phone:         lead.phone,
    leadId:        lead.id,
    notes:         lead.notes,
    tags:          [],
    assignedTo:    lead.assignedTo,
    assignedName:  lead.assignedName,
    createdAt:     now,
    createdBy:     author.uid,
    updatedAt:     now,
  };
  const clientRef = await addDoc(collection(db, CLIENTS), clientData);
  const client    = { ...clientData, id: clientRef.id };

  const entry: ActivityEntry = {
    id:         crypto.randomUUID(),
    type:       "conversion",
    content:    `Converted to client (${client.clientId})`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  now,
  };
  await updateDoc(doc(db, LEADS, lead.id), {
    stage:       "client" as LeadStage,
    convertedAt: now,
    convertedBy: author.uid,
    clientId:    clientRef.id,
    activity:    arrayUnion(entry),
    updatedAt:   now,
  });

  return client;
}

/* ── Clients ────────────────────────────────────── */

export async function getClients(): Promise<Client[]> {
  const snap = await getDocs(query(collection(db, CLIENTS), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client));
}

export async function getClient(id: string): Promise<Client | null> {
  const snap = await getDoc(doc(db, CLIENTS, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Client) : null;
}

export async function updateClientNotes(clientId: string, notes: string): Promise<void> {
  await updateDoc(doc(db, CLIENTS, clientId), { notes, updatedAt: new Date().toISOString() });
}

/* ── Auto-assignment ────────────────────────────────────── */

export async function getLeastLoadedStaff(): Promise<StaffMember | null> {
  const [leads, staff] = await Promise.all([getLeads(), getStaffList()]);
  if (!staff.length) return null;

  const activeLeads = leads.filter((l) => l.stage === "lead" || l.stage === "prospect");
  const counts: Record<string, number> = {};
  staff.forEach((s) => { counts[s.uid] = 0; });
  activeLeads.forEach((l) => { counts[l.assignedTo] = (counts[l.assignedTo] ?? 0) + 1; });

  return staff.reduce((min, s) =>
    (counts[s.uid] ?? 0) < (counts[min.uid] ?? 0) ? s : min
  );
}
