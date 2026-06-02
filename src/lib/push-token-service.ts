import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const COL = "push_tokens";

export async function saveFCMToken(uid: string, token: string): Promise<void> {
  const ref      = doc(db, COL, uid);
  const snap     = await getDoc(ref);
  const existing: string[] = snap.exists() ? (snap.data().tokens ?? []) : [];
  if (existing.includes(token)) return;
  await setDoc(ref, { tokens: [...existing, token], updatedAt: new Date().toISOString() });
}

export async function removeFCMToken(uid: string, token: string): Promise<void> {
  const ref  = doc(db, COL, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const filtered = (snap.data().tokens ?? []).filter((t: string) => t !== token);
  await setDoc(ref, { tokens: filtered, updatedAt: new Date().toISOString() });
}
