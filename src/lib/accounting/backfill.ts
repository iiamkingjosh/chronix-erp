import {
  collection, getDocs, query, orderBy, updateDoc, doc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";
import type { PayrollRun } from "@/types/hr";
import type { PurchaseOrder } from "@/types/procurement";
import {
  createCashBasisPaymentJournalEntry,
  createExpenseJournalEntry,
  createPayrollJournalEntry,
  createPOJournalEntry,
} from "./auto-journal";

export interface BackfillResult {
  found:   number;
  created: number;
  skipped: number;
  errors:  number;
}

export interface FullBackfillResult {
  expenses: BackfillResult;
  invoices: BackfillResult;
  payments: BackfillResult;
  payroll:  BackfillResult;
  pos:      BackfillResult;
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

/** Best-effort cleanup — never throws, never blocks the caller. */
function clearJournalError(col: string, id: string) {
  updateDoc(doc(db, col, id), { _journalError: null }).catch(() => {});
}

/**
 * Fetch all referenceIds that already have a journal entry.
 * One Firestore read instead of N reads — eliminates sequential query bottleneck.
 */
async function fetchPostedReferenceIds(): Promise<Set<string>> {
  const snap = await getDocs(
    query(collection(db, "journal_entries"), where("status", "==", "posted"))
  );
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const refId = d.data().referenceId as string | undefined;
    if (refId) ids.add(refId);
  });
  return ids;
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */

export async function backfillExpenseJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const snap     = await getDocs(query(collection(db, "expenses"), orderBy("submittedAt")));
  const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
  const paid     = expenses.filter((e) => e.status === "paid");
  const ids      = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: paid.length, created: 0, skipped: 0, errors: 0 };

  for (const expense of paid) {
    if (ids.has(expense.id)) { result.skipped++; continue; }
    if ((expense as unknown as Record<string, unknown>)._journalPosted === true) { result.skipped++; continue; }
    try {
      await createExpenseJournalEntry(expense, userId);
      result.created++;
      updateDoc(doc(db, "expenses", expense.id), { _journalPosted: true, _journalError: null }).catch(() => {});
    } catch (e) {
      console.error(`[backfill] expense ${expense.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Invoices (cash basis) ────────────────────────────────────────────────── */
/*
 * Under cash-basis accounting, unpaid invoices carry no journal entry — revenue
 * is recognised only when cash is received.  This function:
 *   1. Ignores every invoice that is not paid/partially_paid.
 *   2. For each paid invoice, looks up its corresponding payment record(s).
 *   3. Creates a cash-basis JE for any payment that is missing one.
 *
 * Payment JEs are keyed by payment.id (referenceId = payment.id), so the
 * postedIds check and the flag write both target the payment document — not
 * the invoice document.  backfillPaymentJournals() uses the same key, so
 * running both in the same full-backfill sweep is safe only if run
 * sequentially (see runFullBackfill).
 */
export async function backfillInvoiceJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const invoiceSnap = await getDocs(query(collection(db, "invoices"), orderBy("createdAt")));
  const invoices    = invoiceSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
  const paid        = invoices.filter((i) => i.status === "paid" || i.status === "partially_paid");
  const ids         = postedIds ?? await fetchPostedReferenceIds();

  // Load all payments once and group by invoiceId for O(1) lookup.
  const paymentSnap = await getDocs(query(collection(db, "payments"), orderBy("createdAt")));
  const paymentsByInvoice = new Map<string, Payment[]>();
  for (const d of paymentSnap.docs) {
    const p    = { id: d.id, ...d.data() } as Payment;
    const list = paymentsByInvoice.get(p.invoiceId) ?? [];
    list.push(p);
    paymentsByInvoice.set(p.invoiceId, list);
  }

  const result: BackfillResult = { found: paid.length, created: 0, skipped: 0, errors: 0 };

  for (const invoice of paid) {
    const payments = paymentsByInvoice.get(invoice.id) ?? [];

    if (payments.length === 0) {
      // Invoice was marked paid without a payment record (e.g. via a legacy
      // manual status flip).  Cannot build a cash-basis JE without a payment
      // date and amount — log and skip.
      console.warn(`[backfill] Paid invoice ${invoice.id} (${invoice.invoiceNumber}) has no payment record — skipping`);
      result.skipped++;
      continue;
    }

    for (const payment of payments) {
      if (ids.has(payment.id)) { result.skipped++; continue; }
      if ((payment as unknown as Record<string, unknown>)._journalPosted === true) { result.skipped++; continue; }
      try {
        await createCashBasisPaymentJournalEntry(payment, invoice, userId);
        result.created++;
        updateDoc(doc(db, "payments", payment.id), { _journalPosted: true, _journalError: null }).catch(() => {});
      } catch (e) {
        console.error(`[backfill] payment ${payment.id} (invoice ${invoice.id}):`, e);
        result.errors++;
      }
    }
  }

  return result;
}

/* ── Payments (cash basis) ────────────────────────────────────────────────── */
/*
 * Under cash-basis, the payment JE IS the revenue entry — DR Cash / CR Revenue
 * / CR VAT.  Creating it requires the invoice (for per-item revenue accounts
 * and vatAmount).  Invoices are loaded once into a map to avoid N Firestore
 * reads inside the loop.
 */
export async function backfillPaymentJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const [paymentSnap, invoiceSnap] = await Promise.all([
    getDocs(query(collection(db, "payments"), orderBy("createdAt"))),
    getDocs(collection(db, "invoices")),
  ]);

  const payments   = paymentSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
  const invoiceMap = new Map<string, Invoice>(
    invoiceSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Invoice])
  );
  const ids = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: payments.length, created: 0, skipped: 0, errors: 0 };

  for (const payment of payments) {
    if (ids.has(payment.id)) { result.skipped++; continue; }
    if ((payment as unknown as Record<string, unknown>)._journalPosted === true) { result.skipped++; continue; }

    const invoice = invoiceMap.get(payment.invoiceId);
    if (!invoice) {
      console.warn(`[backfill] Invoice ${payment.invoiceId} not found for payment ${payment.id} — skipping`);
      result.errors++;
      continue;
    }

    try {
      await createCashBasisPaymentJournalEntry(payment, invoice, userId);
      result.created++;
      updateDoc(doc(db, "payments", payment.id), { _journalPosted: true, _journalError: null }).catch(() => {});
    } catch (e) {
      console.error(`[backfill] payment ${payment.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Payroll runs ─────────────────────────────────────────────────────────── */

export async function backfillPayrollJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const snap      = await getDocs(query(collection(db, "payroll_runs"), orderBy("year")));
  const runs      = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRun));
  const completed = runs.filter((r) => r.status === "completed");
  const ids       = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: completed.length, created: 0, skipped: 0, errors: 0 };

  for (const run of completed) {
    if (ids.has(run.id)) { result.skipped++; continue; }
    if ((run as unknown as Record<string, unknown>)._journalPosted === true) { result.skipped++; continue; }
    try {
      await createPayrollJournalEntry(run, userId);
      result.created++;
      updateDoc(doc(db, "payroll_runs", run.id), { _journalPosted: true, _journalError: null }).catch(() => {});
    } catch (e) {
      console.error(`[backfill] payroll run ${run.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Purchase Orders ─────────────────────────────────────────────────────── */

export async function backfillPOJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const snap = await getDocs(query(collection(db, "purchase_orders"), orderBy("createdAt")));
  const all  = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder));
  const paid = all.filter((p) => p.status === "paid");
  const ids  = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: paid.length, created: 0, skipped: 0, errors: 0 };

  for (const po of paid) {
    if (ids.has(po.id)) { result.skipped++; continue; }
    if ((po as unknown as Record<string, unknown>)._journalPosted === true) { result.skipped++; continue; }
    try {
      await createPOJournalEntry(po, userId);
      result.created++;
      updateDoc(doc(db, "purchase_orders", po.id), { _journalPosted: true, _journalError: null }).catch(() => {});
    } catch (e) {
      console.error(`[backfill] PO ${po.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Full sweep ───────────────────────────────────────────────────────────── */
/*
 * Invoice and payment backfills are run sequentially (not in parallel) because
 * both now create payment JEs keyed by payment.id.  Running them concurrently
 * against a single pre-fetched postedIds set could create duplicate JEs for the
 * same payment.  Sequential execution ensures backfillInvoiceJournals completes
 * and its created IDs are reflected in a fresh postedIds fetch before
 * backfillPaymentJournals runs.
 */
export async function runFullBackfill(userId: string): Promise<FullBackfillResult> {
  const [expenses, payroll, pos] = await Promise.all([
    backfillExpenseJournals(userId),
    backfillPayrollJournals(userId),
    backfillPOJournals(userId),
  ]);

  // Invoice and payment backfills run sequentially — see note above.
  const invoices = await backfillInvoiceJournals(userId);
  const payments = await backfillPaymentJournals(userId);

  return { expenses, invoices, payments, payroll, pos };
}
