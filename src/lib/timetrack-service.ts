import {
  collection, addDoc, getDocs, query, orderBy, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TimeEntry } from "@/types/timetrack";

const COL = "time_entries";

export async function createTimeEntry(data: Omit<TimeEntry, "id">): Promise<TimeEntry> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getAllTimeEntries(): Promise<TimeEntry[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry));
}

export async function getMyTimeEntries(uid: string): Promise<TimeEntry[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("employeeUid", "==", uid), orderBy("date", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry));
}
