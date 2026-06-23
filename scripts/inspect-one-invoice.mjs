/**
 * One-off, read-only lookup against PRODUCTION (not the emulator) to
 * confirm the literal stored format of `createdBy` on a real invoice.
 * Makes NO writes. Intentionally narrow: only reads invoices matching the
 * number(s) passed on the command line.
 *
 * Usage:
 *   node scripts/inspect-one-invoice.mjs CT260511
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const serviceAccount = require(join(__dirname, '../config/chronix-erp-firebase-adminsdk-fbsvc-3ba562100b.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const needles = process.argv.slice(2);
if (needles.length === 0) {
  console.error('Usage: node scripts/inspect-one-invoice.mjs <invoiceNumber-prefix> [more...]');
  process.exit(1);
}

async function inspect() {
  const snapshot = await db.collection('invoices').get();
  const matches = snapshot.docs.filter((doc) =>
    needles.some((n) => (doc.data().invoiceNumber ?? '').startsWith(n))
  );

  if (matches.length === 0) {
    console.log(`No invoices found with invoiceNumber starting with any of: ${needles.join(', ')}`);
    return;
  }

  for (const doc of matches) {
    const data = doc.data();
    console.log(`Invoice doc id: ${doc.id}`);
    console.log(`  invoiceNumber: ${data.invoiceNumber}`);
    console.log(`  createdBy:     ${JSON.stringify(data.createdBy)}  (typeof ${typeof data.createdBy}, length ${String(data.createdBy).length})`);
    console.log(`  status:        ${data.status}`);
    console.log('');
  }
}

inspect().then(() => process.exit(0)).catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
