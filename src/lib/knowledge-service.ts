import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, orderBy, increment, limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { KBArticle, KBStatus } from "@/types/knowledge";

const COL = "knowledge_base";

export async function createArticle(data: Omit<KBArticle, "id">): Promise<KBArticle> {
  const ref = await addDoc(collection(db, COL), data);
  return { ...data, id: ref.id };
}

export async function getArticles(): Promise<KBArticle[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy("updatedAt", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as KBArticle));
}

export async function getArticle(id: string): Promise<KBArticle | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as KBArticle) : null;
}

export async function updateArticle(id: string, data: Partial<Omit<KBArticle, "id">>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data as Record<string, unknown>, updatedAt: new Date().toISOString() });
}

export async function updateArticleStatus(id: string, status: KBStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), { status, updatedAt: new Date().toISOString() });
}

export async function incrementViewCount(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { viewCount: increment(1) });
}
