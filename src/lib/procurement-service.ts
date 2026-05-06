import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Vendor, PurchaseOrder, POStatus, VendorRating } from "@/types/procurement";

const VND = "vendors";
const PO  = "purchase_orders";

/* ── Vendors ── */
export async function createVendor(data: Omit<Vendor, "id">): Promise<Vendor> {
  const ref = await addDoc(collection(db, VND), data);
  return { ...data, id: ref.id };
}

export async function getVendors(): Promise<Vendor[]> {
  const snap = await getDocs(query(collection(db, VND), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor));
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const snap = await getDoc(doc(db, VND, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Vendor) : null;
}

export async function updateVendorStatus(vendorId: string, status: "active" | "inactive"): Promise<void> {
  await updateDoc(doc(db, VND, vendorId), { status, updatedAt: new Date().toISOString() });
}

export async function addVendorRating(vendorId: string, rating: VendorRating, currentRatings: VendorRating[]): Promise<void> {
  const all    = [...currentRatings, rating];
  const avg    = all.reduce((s, r) => s + r.rating, 0) / all.length;
  await updateDoc(doc(db, VND, vendorId), {
    ratings:   arrayUnion(rating),
    avgRating: Math.round(avg * 10) / 10,
    updatedAt: new Date().toISOString(),
  });
}

/* ── Purchase Orders ── */
export async function createPO(data: Omit<PurchaseOrder, "id">): Promise<PurchaseOrder> {
  const ref = await addDoc(collection(db, PO), data);
  return { ...data, id: ref.id };
}

export async function getPOs(): Promise<PurchaseOrder[]> {
  const snap = await getDocs(query(collection(db, PO), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder));
}

export async function getPO(id: string): Promise<PurchaseOrder | null> {
  const snap = await getDoc(doc(db, PO, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PurchaseOrder) : null;
}

export async function getPOsByVendor(vendorId: string): Promise<PurchaseOrder[]> {
  const snap = await getDocs(
    query(collection(db, PO), where("vendorId", "==", vendorId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder));
}

export async function updatePOStatus(
  poId: string,
  status: POStatus,
  author?: { uid: string; name: string }
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === "approved" && author) {
    updates.approvedBy     = author.uid;
    updates.approvedByName = author.name;
    updates.approvedAt     = new Date().toISOString();
  }
  await updateDoc(doc(db, PO, poId), updates);
}
