import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import type { OnCallSlot } from "@/types/oncall";

const COL = "oncall_schedule";

export async function createOnCallSlot(data: Omit<OnCallSlot, "id">): Promise<OnCallSlot> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getOnCallSlots(): Promise<OnCallSlot[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("weekStart", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as OnCallSlot));
}

export async function deleteOnCallSlot(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export function getCurrentOnCall(slots: OnCallSlot[]): OnCallSlot | null {
  const now = new Date().toISOString().split("T")[0];
  return slots.find((s) => s.weekStart <= now && s.weekEnd >= now) ?? null;
}
