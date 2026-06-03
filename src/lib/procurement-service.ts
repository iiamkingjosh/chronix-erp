import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion, where, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Vendor, PurchaseOrder, POStatus, VendorRating } from "@/types/procurement";
import { createPOJournalEntry } from "@/lib/accounting/auto-journal";
import { logAuditEvent } from "@/lib/audit-service";
import { validateAmount } from "@/lib/utils";

const VND = "vendors";
const PO  = "purchase_orders";

/* ── Vendors ── */
export async function createVendor(data: Omit<Vendor, "id">): Promise<Vendor> {
  const ref = await addDoc(collection(db, VND), data);
  return { ...data, id: ref.id };
}

export async function getVendors(): Promise<Vendor[]> {
  const snap = await getDocs(query(collection(db, VND), orderBy("createdAt", "desc"), limit(50)));
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
  validateAmount(data.total, "total");
  const ref = await addDoc(collection(db, PO), data);
  return { ...data, id: ref.id };
}

export async function getPOs(): Promise<PurchaseOrder[]> {
  const snap = await getDocs(query(collection(db, PO), orderBy("createdAt", "desc"), limit(100)));
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
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updatedAt: now };
  if (status === "approved" && author) {
    updates.approvedBy     = author.uid;
    updates.approvedByName = author.name;
    updates.approvedAt     = now;
  }
  if (status === "paid") {
    updates.paidAt = now;
  }
  await updateDoc(doc(db, PO, poId), updates);

  if (author) {
    logAuditEvent({
      actorUid: author.uid, actorName: author.name, actorRole: "Finance",
      action: status === "approved" ? "approve" : "update",
      module: "purchase_orders", entityId: poId,
      details: `PO status → ${status}`,
      timestamp: now,
    }).catch(() => {});
  }

  if (status === "paid" && author) {
    const po = await getPO(poId);
    if (po) {
      createPOJournalEntry(po, author.uid).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[accounting] PO journal failed:", msg);
        updateDoc(doc(db, PO, poId), { _journalError: msg }).catch(() => {});
      });
    }
  }
}
