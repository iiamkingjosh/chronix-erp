import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const serviceAccount = require(join(__dirname, '../config/chronix-erp-firebase-adminsdk-fbsvc-3ba562100b.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

async function migrateInvoiceNumbers() {
  console.log('Starting invoice number migration...\n');

  const snapshot = await db.collection('invoices').get();

  if (snapshot.empty) {
    console.log('No invoices found — nothing to migrate.');
    return;
  }

  // Group invoices by their date
  const byDate = new Map();
  snapshot.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    const date = data.invoiceDate ?? data.createdAt?.split('T')[0] ?? '000000';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(data);
  });

  const batch = db.batch();
  let total = 0;

  for (const [dateStr, invoices] of byDate) {
    // Sort by createdAt ascending so oldest gets -001
    invoices.sort((a, b) =>
      (a.createdAt ?? a.invoiceDate ?? '').localeCompare(b.createdAt ?? b.invoiceDate ?? '')
    );

    const d      = new Date(dateStr);
    const yy     = String(d.getFullYear()).slice(2);
    const mm     = String(d.getMonth() + 1).padStart(2, '0');
    const dd     = String(d.getDate()).padStart(2, '0');
    const prefix = `${yy}${mm}${dd}`;

    console.log(`${prefix} — ${invoices.length} invoice(s)`);

    invoices.forEach((inv, i) => {
      const newNumber = `CT${prefix}-${String(i + 1).padStart(3, '0')}`;
      console.log(`  ${inv.invoiceNumber ?? '(none)'} → ${newNumber}`);

      batch.update(db.collection('invoices').doc(inv.id), {
        invoiceNumber:         newNumber,
        previousInvoiceNumber: inv.invoiceNumber ?? null,
        migratedAt:            Timestamp.now(),
      });
      total++;
    });

    // Set counter so next invoice on that day continues from the right number
    batch.set(db.collection('metadata').doc(`invoiceCounter_${prefix}`), {
      lastNumber:  invoices.length,
      date:        prefix,
      createdAt:   Timestamp.now(),
    });
  }

  await batch.commit();
  console.log(`\nDone — ${total} invoice(s) migrated.`);
}

migrateInvoiceNumbers().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
