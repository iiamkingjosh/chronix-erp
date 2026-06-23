/**
 * Read-only diagnostic for D9 (docs/prd/finance-tax.md /
 * finance-tax-test-results.md): finds every invoice with NEITHER
 * _journalPosted nor _journalError set, and checks whether a real journal
 * entry actually exists for it anyway (the D9 signature — journal posted
 * fine, but the follow-up flag write was rejected and swallowed).
 *
 * Makes NO writes. Does not fix anything — see scripts/backfill-amount-paid.mjs
 * for the pattern this project uses once a backfill is separately approved.
 *
 * Usage:
 *   node scripts/diagnose-journal-flags.mjs
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

async function diagnose() {
  console.log('Scanning invoices for missing _journalPosted/_journalError flags...\n');

  const snapshot = await db.collection('invoices').get();

  if (snapshot.empty) {
    console.log('No invoices found.');
    return;
  }

  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data();
    const hasPosted = '_journalPosted' in data && data._journalPosted !== undefined;
    const hasError  = '_journalError'  in data && data._journalError  !== undefined;
    return !hasPosted && !hasError;
  });

  console.log(`Checked ${snapshot.size} invoice(s) total. ${candidates.length} have neither flag set.\n`);

  if (candidates.length === 0) {
    console.log('Nothing further to check.');
    return;
  }

  const confirmedD9 = [];   // real journal entry exists, flag missing — the D9 signature
  const noEntryAtAll = [];  // no journal entry found either — a different, rarer failure mode

  for (const doc of candidates) {
    const data = doc.data();
    const entriesSnap = await db.collection('journal_entries')
      .where('referenceId', '==', doc.id)
      .where('referenceType', '==', 'invoice')
      .get();

    if (!entriesSnap.empty) {
      confirmedD9.push({
        invoiceId: doc.id,
        invoiceNumber: data.invoiceNumber ?? '(no number)',
        createdBy: data.createdBy ?? '(unknown)',
        journalEntryIds: entriesSnap.docs.map((e) => e.id),
      });
    } else {
      noEntryAtAll.push({
        invoiceId: doc.id,
        invoiceNumber: data.invoiceNumber ?? '(no number)',
        createdBy: data.createdBy ?? '(unknown)',
      });
    }
  }

  console.log(`── Confirmed D9 (real journal entry exists, flag missing): ${confirmedD9.length} ──`);
  for (const r of confirmedD9) {
    console.log(`  ${r.invoiceId}  (${r.invoiceNumber})  createdBy=${r.createdBy}  journal_entries=[${r.journalEntryIds.join(', ')}]`);
  }

  console.log(`\n── No journal entry found at all (different failure mode — not D9): ${noEntryAtAll.length} ──`);
  for (const r of noEntryAtAll) {
    console.log(`  ${r.invoiceId}  (${r.invoiceNumber})  createdBy=${r.createdBy}`);
  }

  console.log(`\nSummary: ${candidates.length} invoice(s) missing both flags — ${confirmedD9.length} have a real journal entry (D9), ${noEntryAtAll.length} have none at all.`);
}

diagnose().then(() => process.exit(0)).catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
