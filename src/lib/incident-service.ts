import { collection, doc, addDoc, getDoc, getDocs, updateDoc, query, orderBy, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import type { Incident, IncidentStatus, IncidentUpdate } from "@/types/incident";

const COL = "incidents";

export async function createIncident(data: Omit<Incident, "id">): Promise<Incident> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getIncidents(): Promise<Incident[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("detectedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Incident));
}

export async function getIncident(id: string): Promise<Incident | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Incident) : null;
}

export async function updateIncidentStatus(id: string, status: IncidentStatus, extra?: Record<string, string>): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "resolved") update.resolvedAt = now;
  if (status === "closed")   update.closedAt   = now;
  if (extra) Object.assign(update, extra);
  await updateDoc(doc(db, COL, id), update);
}

export async function addIncidentUpdate(id: string, update: IncidentUpdate): Promise<void> {
  await updateDoc(doc(db, COL, id), { updates: arrayUnion(update) });
}

export async function closeIncidentWithRCA(
  id: string,
  rootCause: string,
  actionsTaken: string,
  preventionPlan: string
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: "closed" as IncidentStatus,
    rootCause, actionsTaken, preventionPlan,
    closedAt: new Date().toISOString(),
  });
}
