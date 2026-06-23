import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Admin-SDK equivalent of getNextInvoiceNumber() in invoiceCounter.ts, for
 * server-side contexts (cron jobs, admin routes) that have no authenticated
 * client-SDK user and would otherwise be rejected by firestore.rules'
 * metadata block (canManageFinance() || isSalesRep()). The Admin SDK
 * bypasses rules entirely, so no rule change is needed for this to work —
 * but it MUST read/write the exact same metadata/invoiceCounter_{prefix}
 * document the client-SDK version uses, not a second, parallel counter.
 *
 * Kept in a separate file (not invoiceCounter.ts itself) because that file
 * is imported by client components, and bundling `firebase-admin` into a
 * browser bundle is both broken and wrong — Admin SDK code must only ever
 * be reachable from server-only files (route.ts, this file).
 */
export async function getNextInvoiceNumberAdmin(): Promise<string> {
  const db = getAdminDb();
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const datePrefix = `${yy}${mm}${dd}`;

  const counterRef = db.collection("metadata").doc(`invoiceCounter_${datePrefix}`);

  const newNumber = await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    if (!counterDoc.exists) {
      transaction.set(counterRef, {
        lastNumber: 1,
        date: datePrefix,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      });
      return 1;
    }

    const nextNumber = (counterDoc.data()!.lastNumber as number) + 1;
    transaction.update(counterRef, {
      lastNumber: nextNumber,
      lastUpdatedAt: new Date().toISOString(),
    });
    return nextNumber;
  });

  return `CT${datePrefix}-${String(newNumber).padStart(3, "0")}`;
}
