import {
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, writeBatch, deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import { stripUndefined } from "./utils";
import type { PersonalTask, TaskStatus } from "@/types/personal-tasks";

const COL = "personal_tasks";

/** Scoped to the signed-in user's own uid only — there is no variant of
 * this function (or any other in this file) that takes a different uid.
 * Matches firestore.rules' personal_tasks block, which has no role-based
 * override of any kind, not even Root Admin. */
export async function getMyTasks(uid: string): Promise<PersonalTask[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("createdBy", "==", uid), orderBy("order", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTask));
}

export async function createTask(data: Omit<PersonalTask, "id">): Promise<PersonalTask> {
  const ref = await addDoc(collection(db, COL), stripUndefined(data));
  return { ...data, id: ref.id };
}

/** TaskFormModal always submits the task's full current shape, so an
 * `undefined` here means "the user cleared this field," not "leave it
 * untouched" - stripping the key (like createTask does) would silently
 * leave the old value in Firestore while the UI shows it as cleared.
 * deleteField() makes the removal actually persist. */
export async function updateTask(
  id: string,
  patch: Partial<Omit<PersonalTask, "id" | "createdBy" | "createdAt">>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    payload[key] = value === undefined ? deleteField() : value;
  }
  await updateDoc(doc(db, COL, id), payload);
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Applies the result of a drag operation: recomputed `order` for every
 * task in the affected column(s), plus a `status` change for whichever
 * task actually moved column. Each task in `updates` gets exactly the
 * fields it needs — most are order-only, at most one also carries a
 * status change — kept as one batch so a reorder is atomic. */
export async function applyReorder(
  updates: { id: string; order: number; status?: TaskStatus }[]
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const u of updates) {
    batch.update(doc(db, COL, u.id), {
      order: u.order,
      ...(u.status ? { status: u.status } : {}),
      updatedAt: now,
    });
  }
  await batch.commit();
}
