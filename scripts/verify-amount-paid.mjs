/**
 * Read-only check: confirms every "paid" invoice has amountPaid === total
 * (within the same 0.01 tolerance used by createPayment in
 * src/lib/finance-service.ts). Safe to run any time — makes no writes.
 *
 * Usage:
 *   node scripts/verify-amount-paid.mjs
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
const TOLERANCE = 0.01;

async function verify() {
  const snapshot = await db.collection('invoices').where('status', '==', 'paid').get();

  if (snapshot.empty) {
    console.log('No "paid" invoices found.');
    return;
  }

  let ok = 0;
  let missing = 0;
  let mismatched = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const total = typeof data.total === 'number' ? data.total : 0;

    if (!('amountPaid' in data) || data.amountPaid === undefined) {
      console.log(`MISSING   ${doc.id}  (${data.invoiceNumber ?? '(no number)'})  — amountPaid not set`);
      missing++;
      continue;
    }

    const diff = Math.abs(data.amountPaid - total);
    if (diff > TOLERANCE) {
      console.log(`MISMATCH  ${doc.id}  (${data.invoiceNumber ?? '(no number)'})  — amountPaid=${data.amountPaid}, total=${total}, diff=${diff.toFixed(2)}`);
      mismatched++;
    } else {
      ok++;
    }
  }

  console.log(`\nChecked ${snapshot.size} "paid" invoice(s): ${ok} OK, ${missing} missing amountPaid, ${mismatched} mismatched.`);
  if (missing > 0) console.log('→ Run scripts/backfill-amount-paid.mjs to fix the missing ones.');
  if (mismatched > 0) console.log('→ Mismatches need manual review — amountPaid does not equal total and isn\'t from the backfill.');
}

verify().then(() => process.exit(0)).catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
