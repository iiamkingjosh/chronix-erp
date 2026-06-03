import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Asset, AssetStatus, AssetCondition } from "@/types/asset";

const COL = "assets";

export async function createAsset(data: Omit<Asset, "id">): Promise<Asset> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getAssets(): Promise<Asset[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("createdAt", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Asset));
}

export async function getAsset(id: string): Promise<Asset | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Asset) : null;
}

export async function updateAsset(id: string, data: Partial<Omit<Asset, "id">>): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}

export async function assignAsset(
  id: string,
  employeeUid: string,
  employeeName: string,
): Promise<void> {
  const now = new Date().toISOString();
  const asset = await getAsset(id);
  if (!asset) return;
  const history = [...(asset.assignmentHistory ?? []), { employeeUid, employeeName, assignedAt: now }];
  await updateDoc(doc(db, COL, id), {
    status:         "assigned" as AssetStatus,
    assignedTo:     employeeName,
    assignedToUid:  employeeUid,
    assignedAt:     now,
    assignmentHistory: history,
  });
}

export async function returnAsset(id: string, notes?: string): Promise<void> {
  const now = new Date().toISOString();
  const asset = await getAsset(id);
  if (!asset) return;
  const history = (asset.assignmentHistory ?? []).map((h, i) =>
    i === asset.assignmentHistory.length - 1 && !h.returnedAt ? { ...h, returnedAt: now, notes } : h
  );
  await updateDoc(doc(db, COL, id), {
    status:        "available" as AssetStatus,
    assignedTo:    null,
    assignedToUid: null,
    assignedAt:    null,
    assignmentHistory: history,
  });
}

export async function updateAssetStatus(id: string, status: AssetStatus, condition?: AssetCondition): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (condition) update.condition = condition;
  await updateDoc(doc(db, COL, id), update);
}
