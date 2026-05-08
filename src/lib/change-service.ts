import { collection, doc, addDoc, getDoc, getDocs, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import type { ChangeEntry, ChangeStatus } from "@/types/change";

const COL = "change_log";

export async function createChange(data: Omit<ChangeEntry, "id">): Promise<ChangeEntry> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getChanges(): Promise<ChangeEntry[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChangeEntry));
}

export async function getChange(id: string): Promise<ChangeEntry | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ChangeEntry) : null;
}

export async function updateChangeStatus(
  id: string,
  status: ChangeStatus,
  actorName?: string,
  extra?: { rejectionReason?: string; postImplementationNotes?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  if (status === "approved")     { update.approvedBy = actorName; update.approvedAt = now; }
  if (status === "in_progress")  { update.implementedAt = now; }
  if (status === "failed" || status === "cancelled") {
    if (extra?.rejectionReason) update.rejectionReason = extra.rejectionReason;
  }
  if (status === "completed" && extra?.postImplementationNotes) {
    update.postImplementationNotes = extra.postImplementationNotes;
  }
  await updateDoc(doc(db, COL, id), update);
}
