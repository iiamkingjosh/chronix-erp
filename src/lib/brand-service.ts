import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import type { BrandAsset, ContentPost, Campaign, EmailCampaign } from "@/types/brand";

/* ── Brand Assets ── */
export async function createBrandAsset(data: Omit<BrandAsset, "id">): Promise<BrandAsset> {
  const ref = await addDoc(collection(db, "brand_assets"), data);
  return { ...data, id: ref.id };
}
export async function getBrandAssets(): Promise<BrandAsset[]> {
  const snap = await getDocs(query(collection(db, "brand_assets"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BrandAsset));
}
export async function deleteBrandAsset(id: string): Promise<void> {
  await deleteDoc(doc(db, "brand_assets", id));
}

/* ── Content Posts ── */
export async function createContentPost(data: Omit<ContentPost, "id">): Promise<ContentPost> {
  const ref = await addDoc(collection(db, "content_posts"), data);
  return { ...data, id: ref.id };
}
export async function getContentPosts(): Promise<ContentPost[]> {
  const snap = await getDocs(query(collection(db, "content_posts"), orderBy("scheduledDate", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContentPost));
}
export async function updatePostStatus(id: string, status: ContentPost["status"]): Promise<void> {
  await updateDoc(doc(db, "content_posts", id), { status });
}

/* ── Campaigns ── */
export async function createCampaign(data: Omit<Campaign, "id">): Promise<Campaign> {
  const ref = await addDoc(collection(db, "campaigns"), data);
  return { ...data, id: ref.id };
}
export async function getCampaigns(): Promise<Campaign[]> {
  const snap = await getDocs(query(collection(db, "campaigns"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
}
export async function updateCampaignStatus(id: string, status: Campaign["status"]): Promise<void> {
  await updateDoc(doc(db, "campaigns", id), { status });
}

/* ── Email Campaigns ── */
export async function createEmailCampaign(data: Omit<EmailCampaign, "id">): Promise<EmailCampaign> {
  const ref = await addDoc(collection(db, "email_campaigns"), data);
  return { ...data, id: ref.id };
}
export async function getEmailCampaigns(): Promise<EmailCampaign[]> {
  const snap = await getDocs(query(collection(db, "email_campaigns"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmailCampaign));
}
export async function updateEmailCampaignStatus(id: string, status: EmailCampaign["status"], extra?: { sentAt?: string; sentCount?: number }): Promise<void> {
  await updateDoc(doc(db, "email_campaigns", id), { status, ...extra });
}
