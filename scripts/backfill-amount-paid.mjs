/**
 * One-time backfill: sets `amountPaid` on every invoice that is already
 * status === "paid" but predates the D6 fix (createPayment in
 * src/lib/finance-service.ts now writes amountPaid transactionally on every
 * new payment, but invoices paid BEFORE that change have no such field).
 *
 * For each one found:
 *   amountPaid = total   (a "paid" invoice under the old logic was, by
 *                          definition, treated as fully settled regardless
 *                          of actual payment amounts — see D6 in
 *                          docs/prd/finance-tax.md — so `total` is the only
 *                          honest value to backfill; there is no reliable
 *                          way to reconstruct what was actually paid for
 *                          pre-fix invoices without re-summing their
 *                          `payments` docs, which is intentionally NOT done
 *                          here — see the note at the bottom of this file).
 *
 * Untouched:
 *   - any invoice that already has `amountPaid` set (any value, including 0)
 *   - any invoice whose status is not exactly "paid"
 *
 * Usage:
 *   node scripts/backfill-amount-paid.mjs            (writes for real)
 *   node scripts/backfill-amount-paid.mjs --dry-run   (preview only, no writes)
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

const DRY_RUN = process.argv.includes('--dry-run');

async function backfillAmountPaid() {
  console.log(`Starting amountPaid backfill${DRY_RUN ? ' (DRY RUN — no writes will be made)' : ''}...\n`);

  const snapshot = await db.collection('invoices').where('status', '==', 'paid').get();

  if (snapshot.empty) {
    console.log('No "paid" invoices found — nothing to do.');
    return;
  }

  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return !('amountPaid' in data) || data.amountPaid === undefined;
  });

  if (candidates.length === 0) {
    console.log(`Checked ${snapshot.size} "paid" invoice(s) — all already have amountPaid set. Nothing to do.`);
    return;
  }

  console.log(`Found ${candidates.length} "paid" invoice(s) missing amountPaid (of ${snapshot.size} total "paid" invoices):\n`);

  const BATCH_SIZE = 400; // Firestore batch limit is 500 operations
  let total = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const doc of chunk) {
      const data  = doc.data();
      const total_ = typeof data.total === 'number' ? data.total : 0;
      console.log(`  ${doc.id}  (${data.invoiceNumber ?? '(no number)'})  →  amountPaid = ${total_}`);

      if (!DRY_RUN) {
        batch.update(db.collection('invoices').doc(doc.id), { amountPaid: total_ });
      }
      total++;
    }

    if (!DRY_RUN) {
      await batch.commit();
    }
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${total} invoice(s).`);
}

backfillAmountPaid().then(() => process.exit(0)).catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

/*
 * NOTE on accuracy: this sets amountPaid = total for every pre-fix "paid"
 * invoice, which is correct under the OLD behavior's own assumption (any
 * payment, of any size, flipped status to "paid" — see D6). If you suspect
 * some pre-fix "paid" invoices were actually only partially paid in reality
 * (i.e. the old bug already produced an incorrect "paid" status for them),
 * this script will NOT detect or correct that — it documents the invoice as
 * fully paid going forward, matching what the UI already showed before this
 * fix. Reconstructing true historical amounts would require summing each
 * invoice's `payments` docs instead of using `total` — deliberately not done
 * here without your sign-off, since it changes the backfill's meaning from
 * "make the new field consistent with the old status" to "retroactively
 * recompute what should have happened." Say so if you want that version instead.
 */
