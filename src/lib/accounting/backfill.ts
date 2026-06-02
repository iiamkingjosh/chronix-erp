import {
  collection, getDocs, query, orderBy, updateDoc, doc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";
import type { PayrollRun } from "@/types/hr";
import type { PurchaseOrder } from "@/types/procurement";
import {
  createExpenseJournalEntry,
  createInvoiceJournalEntry,
  createPaymentJournalEntry,
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
    try {
      await createExpenseJournalEntry(expense, userId);
      result.created++;
      clearJournalError("expenses", expense.id);
    } catch (e) {
      console.error(`[backfill] expense ${expense.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Invoices ─────────────────────────────────────────────────────────────── */

export async function backfillInvoiceJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const snap    = await getDocs(query(collection(db, "invoices"), orderBy("createdAt")));
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
  const ids     = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: invoices.length, created: 0, skipped: 0, errors: 0 };

  for (const invoice of invoices) {
    if (ids.has(invoice.id)) { result.skipped++; continue; }
    try {
      await createInvoiceJournalEntry(invoice, userId);
      result.created++;
      clearJournalError("invoices", invoice.id);
    } catch (e) {
      console.error(`[backfill] invoice ${invoice.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Payments ─────────────────────────────────────────────────────────────── */

export async function backfillPaymentJournals(
  userId: string,
  postedIds?: Set<string>
): Promise<BackfillResult> {
  const snap    = await getDocs(query(collection(db, "payments"), orderBy("createdAt")));
  const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
  const ids     = postedIds ?? await fetchPostedReferenceIds();

  const result: BackfillResult = { found: payments.length, created: 0, skipped: 0, errors: 0 };

  for (const payment of payments) {
    if (ids.has(payment.id)) { result.skipped++; continue; }
    try {
      await createPaymentJournalEntry(payment, userId);
      result.created++;
      clearJournalError("payments", payment.id);
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
    try {
      await createPayrollJournalEntry(run, userId);
      result.created++;
      clearJournalError("payroll_runs", run.id);
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
    try {
      await createPOJournalEntry(po, userId);
      result.created++;
      clearJournalError("purchase_orders", po.id);
    } catch (e) {
      console.error(`[backfill] PO ${po.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Full sweep ───────────────────────────────────────────────────────────── */

export async function runFullBackfill(userId: string): Promise<FullBackfillResult> {
  // Fetch the posted-referenceId set once — shared across all five passes
  const postedIds = await fetchPostedReferenceIds();

  const [expenses, invoices, payments, payroll, pos] = await Promise.all([
    backfillExpenseJournals(userId,  postedIds),
    backfillInvoiceJournals(userId,  postedIds),
    backfillPaymentJournals(userId,  postedIds),
    backfillPayrollJournals(userId,  postedIds),
    backfillPOJournals(userId,       postedIds),
  ]);

  return { expenses, invoices, payments, payroll, pos };
}
