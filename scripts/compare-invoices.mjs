/**
 * One-off, read-only: dumps the FULL contents of specific invoice documents
 * by doc ID, for side-by-side comparison. Makes NO writes.
 *
 * Usage:
 *   node scripts/compare-invoices.mjs <docId1> <docId2> [...]
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

const docIds = process.argv.slice(2);
if (docIds.length === 0) {
  console.error('Usage: node scripts/compare-invoices.mjs <docId1> <docId2> [...]');
  process.exit(1);
}

async function compare() {
  for (const id of docIds) {
    const snap = await db.collection('invoices').doc(id).get();
    console.log(`\n=== ${id} ===`);
    if (!snap.exists) {
      console.log('  (not found)');
      continue;
    }
    console.log(JSON.stringify(snap.data(), null, 2));
  }

  // Also check journal_entries referencing each, so we can see whether
  // separate ledger entries exist too (relevant to whether this is a real
  // duplicate billing event, not just a duplicate-looking record).
  console.log('\n=== journal_entries referencing each invoice ===');
  for (const id of docIds) {
    const entriesSnap = await db.collection('journal_entries')
      .where('referenceId', '==', id)
      .where('referenceType', '==', 'invoice')
      .get();
    console.log(`${id}: ${entriesSnap.size} journal entry(ies) — ${entriesSnap.docs.map((d) => d.id).join(', ') || '(none)'}`);
  }
}

compare().then(() => process.exit(0)).catch((err) => {
  console.error('Comparison failed:', err);
  process.exit(1);
});
