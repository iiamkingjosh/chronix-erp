import { collection, doc, addDoc, getDoc, getDocs, updateDoc, query, orderBy, arrayUnion, limit } from "firebase/firestore";
import { db } from "./firebase";
import type { Incident, IncidentStatus, IncidentUpdate } from "@/types/incident";
import { logAuditEvent } from "@/lib/audit-service";

const COL = "incidents";

interface Author { uid: string; name: string; role: string; }

export async function createIncident(data: Omit<Incident, "id">): Promise<Incident> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getIncidents(): Promise<Incident[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("detectedAt", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Incident));
}

export async function getIncident(id: string): Promise<Incident | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Incident) : null;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  author: Author,
  extra?: Record<string, string>
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "resolved") update.resolvedAt = now;
  if (status === "closed")   update.closedAt   = now;
  if (extra) Object.assign(update, extra);
  await updateDoc(doc(db, COL, id), update);

  const incident = await getIncident(id);
  await logAuditEvent({
    actorUid: author.uid, actorName: author.name, actorRole: author.role,
    action: "update", module: "incidents",
    entityId: id, entityRef: incident?.incidentRef ?? id,
    details: `Incident ${incident?.incidentRef ?? id} status changed to ${status}`,
    timestamp: now,
  });
}

export async function addIncidentUpdate(id: string, update: IncidentUpdate): Promise<void> {
  await updateDoc(doc(db, COL, id), { updates: arrayUnion(update) });
}

/** D3: requires the incident to already be "resolved" - matching what
 * the UI's own "Close with RCA" button has only ever permitted (it only
 * renders when status === "resolved"; there is no other close path in
 * this UI). Previously enforced only by hiding the button - a direct
 * call could skip "resolved" entirely, leaving resolvedAt undefined on a
 * closed incident. Rejects clearly now rather than silently no-op'ing.
 * Defensive fallback: if resolvedAt is somehow still missing at close
 * time, set it alongside closedAt rather than leaving it undefined. */
export async function closeIncidentWithRCA(
  id: string,
  rootCause: string,
  actionsTaken: string,
  preventionPlan: string,
  author: Author
): Promise<void> {
  const incident = await getIncident(id);
  if (!incident) {
    throw new Error("Incident not found.");
  }
  if (incident.status !== "resolved") {
    throw new Error("This incident must be resolved before it can be closed with an RCA.");
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: "closed" as IncidentStatus,
    rootCause, actionsTaken, preventionPlan,
    closedAt: now,
  };
  if (!incident.resolvedAt) update.resolvedAt = now;

  await updateDoc(doc(db, COL, id), update);

  await logAuditEvent({
    actorUid: author.uid, actorName: author.name, actorRole: author.role,
    action: "resolve", module: "incidents",
    entityId: id, entityRef: incident.incidentRef,
    details: `Incident ${incident.incidentRef} closed with RCA`,
    timestamp: now,
  });
}
