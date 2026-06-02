import { collection, getDocs, query, orderBy, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";
import type { PayrollRun } from "@/types/hr";
import { getJournalEntriesByReference } from "./journal-entries";
import {
  createExpenseJournalEntry,
  createInvoiceJournalEntry,
  createPaymentJournalEntry,
  createPayrollJournalEntry,
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
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

/** Best-effort cleanup — never throws, never blocks the caller. */
function clearJournalError(col: string, id: string) {
  updateDoc(doc(db, col, id), { _journalError: null }).catch(() => {});
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */

export async function backfillExpenseJournals(userId: string): Promise<BackfillResult> {
  const snap    = await getDocs(query(collection(db, "expenses"), orderBy("submittedAt")));
  const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
  const paid     = expenses.filter((e) => e.status === "paid");

  const result: BackfillResult = { found: paid.length, created: 0, skipped: 0, errors: 0 };

  for (const expense of paid) {
    try {
      const existing = await getJournalEntriesByReference(expense.id);
      if (existing.length > 0) { result.skipped++; continue; }
      await createExpenseJournalEntry(expense, userId);
      result.created++;                              // count before cleanup
      clearJournalError("expenses", expense.id);     // best-effort, never blocks
    } catch (e) {
      console.error(`[backfill] expense ${expense.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Invoices ─────────────────────────────────────────────────────────────── */

export async function backfillInvoiceJournals(userId: string): Promise<BackfillResult> {
  const snap    = await getDocs(query(collection(db, "invoices"), orderBy("createdAt")));
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));

  const result: BackfillResult = { found: invoices.length, created: 0, skipped: 0, errors: 0 };

  for (const invoice of invoices) {
    try {
      const existing = await getJournalEntriesByReference(invoice.id);
      if (existing.length > 0) { result.skipped++; continue; }
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

export async function backfillPaymentJournals(userId: string): Promise<BackfillResult> {
  const snap    = await getDocs(query(collection(db, "payments"), orderBy("createdAt")));
  const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));

  const result: BackfillResult = { found: payments.length, created: 0, skipped: 0, errors: 0 };

  for (const payment of payments) {
    try {
      const existing = await getJournalEntriesByReference(payment.id);
      if (existing.length > 0) { result.skipped++; continue; }
      await createPaymentJournalEntry(payment, userId);
      result.created++;
      // payments are immutable by rule — cleanup is a no-op but never throws
      clearJournalError("payments", payment.id);
    } catch (e) {
      console.error(`[backfill] payment ${payment.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Payroll runs ─────────────────────────────────────────────────────────── */

export async function backfillPayrollJournals(userId: string): Promise<BackfillResult> {
  const snap     = await getDocs(query(collection(db, "payroll_runs"), orderBy("year")));
  const runs     = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRun));
  const completed = runs.filter((r) => r.status === "completed");

  const result: BackfillResult = { found: completed.length, created: 0, skipped: 0, errors: 0 };

  for (const run of completed) {
    try {
      const existing = await getJournalEntriesByReference(run.id);
      if (existing.length > 0) { result.skipped++; continue; }
      await createPayrollJournalEntry(run, userId);
      result.created++;                                    // success before cleanup
      clearJournalError("payroll_runs", run.id);           // may be blocked by HR-only rule — that's fine
    } catch (e) {
      console.error(`[backfill] payroll run ${run.id}:`, e);
      result.errors++;
    }
  }

  return result;
}

/* ── Full sweep ───────────────────────────────────────────────────────────── */

export async function runFullBackfill(userId: string): Promise<FullBackfillResult> {
  const [expenses, invoices, payments, payroll] = await Promise.all([
    backfillExpenseJournals(userId),
    backfillInvoiceJournals(userId),
    backfillPaymentJournals(userId),
    backfillPayrollJournals(userId),
  ]);
  return { expenses, invoices, payments, payroll };
}
