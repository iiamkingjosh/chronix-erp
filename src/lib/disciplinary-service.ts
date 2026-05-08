import {
  collection, doc, addDoc, getDocs, updateDoc,
  query, orderBy, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { DiscEntry, DiscStatus } from "@/types/disciplinary";

const COL = "disciplinary_records";

export async function createDiscEntry(data: Omit<DiscEntry, "id">): Promise<DiscEntry> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getDiscEntries(): Promise<DiscEntry[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("issuedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiscEntry));
}

export async function getEmployeeDiscEntries(uid: string): Promise<DiscEntry[]> {
  const snap = await getDocs(
    query(collection(db, COL), where("employeeUid", "==", uid), orderBy("issuedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiscEntry));
}

export async function resolveDiscEntry(id: string, resolution: string, resolvedBy: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: "resolved" as DiscStatus,
    resolution,
    resolvedBy,
    resolvedAt: new Date().toISOString(),
  });
}

export async function addEmployeeResponse(id: string, response: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    employeeResponse: response,
    responseAt: new Date().toISOString(),
  });
}

export async function updateDiscStatus(id: string, status: DiscStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), { status });
}
