import { doc, runTransaction, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * FIRS-COMPLIANT DATE-BASED SEQUENTIAL INVOICE NUMBERING
 * Format: CT260514-001, CT260514-002, etc.
 */

export async function getNextInvoiceNumber(): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `${yy}${mm}${dd}`;

  const counterRef = doc(db, 'metadata', `invoiceCounter_${datePrefix}`);

  const newNumber = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    if (!counterDoc.exists()) {
      transaction.set(counterRef, {
        lastNumber: 1,
        date: datePrefix,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      });
      return 1;
    }

    const nextNumber = (counterDoc.data().lastNumber as number) + 1;
    transaction.update(counterRef, {
      lastNumber: nextNumber,
      lastUpdatedAt: new Date().toISOString(),
    });
    return nextNumber;
  });

  return `CT${datePrefix}-${String(newNumber).padStart(3, '0')}`;
}

export async function getTodayInvoiceCount(): Promise<number> {
  try {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const counterDoc = await getDoc(doc(db, 'metadata', `invoiceCounter_${yy}${mm}${dd}`));
    return counterDoc.exists() ? (counterDoc.data().lastNumber as number) : 0;
  } catch {
    return 0;
  }
}

export async function previewNextInvoiceNumber(): Promise<string> {
  try {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;
    const counterDoc = await getDoc(doc(db, 'metadata', `invoiceCounter_${datePrefix}`));
    const next = counterDoc.exists() ? (counterDoc.data().lastNumber as number) + 1 : 1;
    return `CT${datePrefix}-${String(next).padStart(3, '0')}`;
  } catch {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `CT${yy}${mm}${dd}-001`;
  }
}
