import { db } from "@/lib/firebase";
import { doc, runTransaction, Timestamp } from "firebase/firestore";

export async function getNextExpenseNumber(): Promise<string> {
  const today = new Date();
  const yy    = String(today.getFullYear()).slice(2);
  const mm    = String(today.getMonth() + 1).padStart(2, "0");
  const dd    = String(today.getDate()).padStart(2, "0");
  const prefix = `${yy}${mm}${dd}`;
  const counterRef = doc(db, "metadata", `expenseCounter_${prefix}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    if (!snap.exists()) {
      tx.set(counterRef, { lastNumber: 1, date: prefix, createdAt: Timestamp.now(), lastUpdatedAt: Timestamp.now() });
      return 1;
    }
    const n = (snap.data().lastNumber as number) + 1;
    tx.update(counterRef, { lastNumber: n, lastUpdatedAt: Timestamp.now() });
    return n;
  });

  return `EXP${prefix}-${String(next).padStart(3, "0")}`;
}
