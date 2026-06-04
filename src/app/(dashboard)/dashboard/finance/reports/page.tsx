"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoices, getPayments } from "@/lib/finance-service";
import { getExpenses } from "@/lib/expense-service";
import { getPOs } from "@/lib/procurement-service";
import { runFullBackfill, type FullBackfillResult } from "@/lib/accounting/backfill";
import { formatNaira, formatDate } from "@/types/finance";
import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";
import type { PurchaseOrder } from "@/types/procurement";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

type ReportTab = "pl" | "ar" | "ap" | "revenue";
type PeriodYear = string;

function buildYears(): PeriodYear[] {
  const y = new Date().getFullYear();
  return [String(y), String(y - 1), String(y - 2)];
}

function ageBucket(dateStr: string): "0-30" | "31-60" | "61-90" | "90+" {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function exportCSV(rows: string[][], filename: string) {
  const bom = "﻿";
  const csv = bom + rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = filename;
  a.click();
}

export default function FinancialReportsPage() {
  const { profile }               = useAuth();
  const [tab, setTab]             = useState<ReportTab>("pl");
  const [year, setYear]           = useState(String(new Date().getFullYear()));
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [payments, setPayments]   = useState<Payment[]>([]);
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [pos,      setPos]        = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]     = useState(true);

  const canView       = profile ? hasPermission(profile.role, "view:finance") || hasPermission(profile.role, "view:reports") : false;
  const canReconcile  = profile ? ["CEO", "CFO", "Root", "Root Admin", "Chronix Root"].includes(profile.role) : false;

  const [reconciling,       setReconciling]       = useState(false);
  const [reconcileResult,   setReconcileResult]   = useState<FullBackfillResult | null>(null);
  const [reconcileError,    setReconcileError]    = useState<string | null>(null);

  async function handleReconcile() {
    if (!profile || reconciling) return;
    setReconciling(true);
    setReconcileResult(null);
    setReconcileError(null);
    try {
      const result = await runFullBackfill(profile.uid);
      setReconcileResult(result);
    } catch (e) {
      setReconcileError(e instanceof Error ? e.message : "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  }

  useEffect(() => {
    Promise.all([getInvoices(), getPayments(), getExpenses(), getPOs()])
      .then(([inv, pay, exp, poList]) => {
        setInvoices(inv); setPayments(pay); setExpenses(exp); setPos(poList);
      })
      .catch((e) => console.error("[finance/reports] Failed to load data:", e))
      .finally(() => setLoading(false));
  }, []);

  if (!canView) return <div className="p-8 text-white/40 font-helvetica">Access restricted.</div>;

  /* ── P&L helpers ── */
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const plData = MONTHS.map((month, mi) => {
    const period = `${year}-${String(mi + 1).padStart(2, "0")}`;
    const revenue  = invoices.filter((i) => i.status === "paid" && i.invoiceDate?.startsWith(period)).reduce((s, i) => s + (i.subtotal ?? i.total), 0);
    // Only count PAID expenses — these match what is journalized into the ledger.
    // Approved-but-unpaid are Accounts Payable (see AP Aging tab), not yet cash expenses.
    const expTotal = expenses
      .filter((e) => e.status === "paid" && e.date?.startsWith(period))
      .reduce((s, e) => s + e.amount, 0);
    const poTotal = pos
      .filter((p) => p.status === "paid" && p.createdAt?.slice(0, 7) === period)
      .reduce((s, p) => s + p.total, 0);
    const totalExp = expTotal + poTotal;
    return { month, revenue, expenses: totalExp, profit: revenue - totalExp };
  });

  const totalRevenue  = plData.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = plData.reduce((s, r) => s + r.expenses, 0);
  const totalProfit   = totalRevenue - totalExpenses;

  // Approved-but-unpaid liabilities — surfaced separately so nothing is hidden
  const approvedUnpaidExpenses = expenses
    .filter((e) => e.status === "approved" && e.date?.startsWith(year))
    .reduce((s, e) => s + e.amount, 0);
  const approvedUnpaidPOs = pos
    .filter((p) => (p.status === "approved" || p.status === "delivered") && p.createdAt?.startsWith(year))
    .reduce((s, p) => s + p.total, 0);
  const totalUnliquidated = approvedUnpaidExpenses + approvedUnpaidPOs;

  /* ── AR Aging ── */
  const arRows = invoices.filter((i) => i.status !== "paid" && i.approvalStatus !== "draft");
  const arBuckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  arRows.forEach((i) => { arBuckets[ageBucket(i.dueDate)] += i.total; });

  /* ── AP Aging ── */
  const apRows = expenses.filter((e) => e.status === "approved");
  const apBuckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  apRows.forEach((e) => { apBuckets[ageBucket(e.date)] += e.amount; });

  /* ── Revenue by Client ── */
  const revenueByClient = invoices
    .filter((i) => i.status === "paid" && i.invoiceDate?.startsWith(year))
    .reduce<Record<string, number>>((acc, i) => {
      acc[i.client.name] = (acc[i.client.name] ?? 0) + (i.subtotal ?? i.total);
      return acc;
    }, {});
  const revenueClientRows = Object.entries(revenueByClient).sort((a, b) => b[1] - a[1]);

  /* ── Exports ── */
  function exportPL() {
    exportCSV(
      [["Month", "Revenue excl VAT (₦)", "Expenses (₦)", "Profit (₦)"],
       ...plData.map((r) => [r.month, r.revenue.toFixed(2), r.expenses.toFixed(2), r.profit.toFixed(2)]),
       ["TOTAL", totalRevenue.toFixed(2), totalExpenses.toFixed(2), totalProfit.toFixed(2)]],
      `PL-${year}.csv`
    );
  }
  function exportAR() {
    exportCSV(
      [["Invoice #", "Client", "Due Date", "Amount (₦)", "Status", "Age Bucket"],
       ...arRows.map((i) => [i.invoiceNumber, i.client.name, formatDate(i.dueDate), i.total.toFixed(2), i.status, ageBucket(i.dueDate)])],
      `AR-Aging-${year}.csv`
    );
  }
  function exportAP() {
    exportCSV(
      [["Title", "Category", "Date", "Amount (₦)", "Submitted By", "Age Bucket"],
       ...apRows.map((e) => [e.title, e.category, e.date, e.amount.toFixed(2), e.submittedBy, ageBucket(e.date)])],
      `AP-Aging-${year}.csv`
    );
  }
  function exportRevenue() {
    exportCSV(
      [["Client", "Total Revenue (₦)"],
       ...revenueClientRows.map(([client, total]) => [client, total.toFixed(2)])],
      `Revenue-by-Client-${year}.csv`
    );
  }

  function exportReportPDF() {
    const fmtN = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const esc  = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const base = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:32px;font-size:12px;color:#111}
      h1{font-size:18px;margin-bottom:4px}p.sub{color:#555;font-size:11px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse}
      th{background:#f4f4f4;border:1px solid #ddd;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      td{border:1px solid #eee;padding:6px 8px}
      .num{text-align:right}.ctr{text-align:center}.pos{color:#166534}.neg{color:#991b1b}
      tfoot td{background:#f9f9f9;font-weight:600}@media print{body{padding:16px}}
    </style></head><body>`;

    let body = "";
    if (tab === "pl") {
      const rows = plData.map((r) => `<tr>
        <td>${r.month}</td>
        <td class="num pos">${fmtN(r.revenue)}</td>
        <td class="num neg">${fmtN(r.expenses)}</td>
        <td class="num ${r.profit >= 0 ? "pos" : "neg"}">${fmtN(r.profit)}</td>
        <td class="ctr">${r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) + "%" : "—"}</td>
      </tr>`).join("");
      body = `<h1>P&amp;L Statement — ${esc(year)}</h1>
        <p class="sub">Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; Revenue (excl. VAT): ${fmtN(totalRevenue)} &nbsp;·&nbsp; Profit: ${fmtN(totalProfit)}</p>
        <table><thead><tr><th>Month</th><th>Revenue (excl. VAT)</th><th>Expenses</th><th>Net Profit</th><th>Margin</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>TOTAL</td><td class="num">${fmtN(totalRevenue)}</td><td class="num">${fmtN(totalExpenses)}</td><td class="num">${fmtN(totalProfit)}</td><td></td></tr></tfoot></table>`;
    } else if (tab === "ar") {
      const rows = arRows.map((i) => `<tr>
        <td>${esc(i.invoiceNumber)}</td><td>${esc(i.client.name)}</td>
        <td>${esc(formatDate(i.dueDate))}</td><td class="num">${fmtN(i.total)}</td>
        <td class="ctr">${esc(i.status)}</td><td class="ctr">${ageBucket(i.dueDate)} days</td>
      </tr>`).join("");
      const totalAR = arRows.reduce((s, i) => s + i.total, 0);
      body = `<h1>Accounts Receivable Aging</h1>
        <p class="sub">Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; ${arRows.length} outstanding invoice${arRows.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Total: ${fmtN(totalAR)}</p>
        <table><thead><tr><th>Invoice #</th><th>Client</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Age</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#999">No outstanding receivables.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">Total Outstanding</td><td class="num">${fmtN(totalAR)}</td><td></td><td></td></tr></tfoot></table>`;
    } else if (tab === "ap") {
      const rows = apRows.map((e) => `<tr>
        <td>${esc(e.title)}</td><td>${esc(e.category)}</td>
        <td>${esc(e.submittedBy)}</td><td>${esc(e.date)}</td>
        <td class="num">${fmtN(e.amount)}</td><td class="ctr">${ageBucket(e.date)} days</td>
      </tr>`).join("");
      const totalAP = apRows.reduce((s, e) => s + e.amount, 0);
      body = `<h1>Accounts Payable Aging</h1>
        <p class="sub">Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; ${apRows.length} approved expense${apRows.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Total: ${fmtN(totalAP)}</p>
        <table><thead><tr><th>Title</th><th>Category</th><th>Submitted By</th><th>Date</th><th>Amount</th><th>Age</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#999">No outstanding payables.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="4">Total Outstanding</td><td class="num">${fmtN(totalAP)}</td><td></td></tr></tfoot></table>`;
    } else {
      const rows = revenueClientRows.map(([client, total], idx) => `<tr>
        <td class="ctr">${idx + 1}</td><td>${esc(client)}</td>
        <td class="num">${fmtN(total)}</td>
        <td class="ctr">${totalRevenue > 0 ? ((total / totalRevenue) * 100).toFixed(1) + "%" : "—"}</td>
      </tr>`).join("");
      body = `<h1>Revenue by Client — ${esc(year)}</h1>
        <p class="sub">Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; Total: ${fmtN(totalRevenue)}</p>
        <table><thead><tr><th>#</th><th>Client</th><th>Revenue</th><th>Share</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#999">No paid invoices for ${esc(year)}.</td></tr>`}</tbody>
        <tfoot><tr><td></td><td>Total</td><td class="num">${fmtN(totalRevenue)}</td><td></td></tr></tfoot></table>`;
    }

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(base + body + "</body></html>");
    w.document.close();
    w.print();
  }

  const tabs: { v: ReportTab; label: string }[] = [
    { v: "pl",      label: "P&L Statement" },
    { v: "ar",      label: "AR Aging" },
    { v: "ap",      label: "AP Aging" },
    { v: "revenue", label: "Revenue by Client" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Financial Reports</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">P&amp;L, receivables, payables and revenue analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={(e) => setYear(e.target.value)} className="input-field w-28 text-sm">
            {buildYears().map((y) => <option key={y} value={y} className="bg-primary-dark">{y}</option>)}
          </select>
          <button onClick={tab === "pl" ? exportPL : tab === "ar" ? exportAR : tab === "ap" ? exportAP : exportRevenue}
            className="text-xs text-white/60 hover:text-white font-helvetica border border-white/15 hover:border-white/30 px-3 py-2 rounded-lg transition-colors">
            Export CSV
          </button>
          <button onClick={exportReportPDF} className="text-xs text-white/60 hover:text-white font-helvetica border border-white/15 hover:border-white/30 px-3 py-2 rounded-lg transition-colors">
            Export PDF
          </button>
        </div>
      </div>

      {/* Reconcile Ledger */}
      {canReconcile && (
        <div className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className={cn(
                "flex items-center gap-2 text-xs font-helvetica px-4 py-2 rounded-xl border transition-colors",
                reconciling
                  ? "border-white/10 text-white/20 cursor-not-allowed"
                  : "border-secondary/40 text-secondary hover:bg-secondary/10"
              )}
            >
              {reconciling ? (
                <>
                  <span className="w-3 h-3 border border-secondary border-t-transparent rounded-full animate-spin" />
                  Reconciling…
                </>
              ) : (
                <>
                  <ReconcileIcon />
                  Reconcile Ledger
                </>
              )}
            </button>
            <p className="text-[10px] text-white/20 font-helvetica">
              Finds and posts any missing journal entries for paid expenses, invoices, and payments.
            </p>
          </div>

          {reconcileError && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-helvetica">
              {reconcileError}
            </div>
          )}

          {reconcileResult && (
            <div className="mt-3 surface-card p-4">
              <p className="font-orbitron text-xs font-bold text-white mb-3">Reconciliation Complete</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {(
                  [
                    { label: "Expenses",  r: reconcileResult.expenses },
                    { label: "Invoices",  r: reconcileResult.invoices },
                    { label: "Payments",  r: reconcileResult.payments },
                    { label: "Payroll",   r: reconcileResult.payroll  },
                    { label: "POs",       r: reconcileResult.pos      },
                  ] as const
                ).map(({ label, r }) => (
                  <div key={label} className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-[10px] text-white/40 font-helvetica uppercase tracking-wider mb-2">{label}</p>
                    <p className="text-xs font-helvetica text-white/60">
                      Found <span className="text-white font-semibold">{r.found}</span>
                    </p>
                    <p className="text-xs font-helvetica text-emerald-400">
                      Created <span className="font-semibold">{r.created}</span>
                    </p>
                    <p className="text-xs font-helvetica text-white/40">
                      Already posted <span className="font-semibold">{r.skipped}</span>
                    </p>
                    {r.errors > 0 && (
                      <p className="text-xs font-helvetica text-red-400">
                        Errors <span className="font-semibold">{r.errors}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accounting Reports Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "P&L Statement",    sub: "From journal entries",           href: "/dashboard/finance/reports/profit-loss" },
          { label: "VAT Return",       sub: "FIRS-ready filing",              href: "/dashboard/finance/reports/vat-return" },
          { label: "Balance Sheet",    sub: "Assets = L + E",                 href: "/dashboard/finance/reports/balance-sheet" },
          { label: "Journal Entries",  sub: "Double-entry ledger",            href: "/dashboard/finance/reports/journal-entries" },
          { label: "Year-End Close",   sub: "Transfer P&L to Retained Earnings", href: "/dashboard/finance/reports/year-end" },
        ].map((r) => (
          <Link key={r.href} href={r.href}
            className="surface-card p-4 hover:border-accent/30 border border-transparent transition-colors group">
            <p className="font-orbitron text-xs font-bold text-white group-hover:text-accent transition-colors">{r.label}</p>
            <p className="text-[10px] text-white/30 font-helvetica mt-1">{r.sub}</p>
          </Link>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={cn("px-4 py-2 text-xs rounded-lg font-helvetica border transition-colors",
              tab === t.v ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* P&L */}
          {tab === "pl" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Revenue (excl. VAT)", value: formatNaira(totalRevenue),      color: "text-emerald-400" },
                  { label: "Paid Expenses",             value: formatNaira(totalExpenses),     color: "text-red-400" },
                  { label: "Net Profit",                value: formatNaira(totalProfit),       color: totalProfit >= 0 ? "text-secondary" : "text-red-400" },
                  { label: "Approved (Unliquidated)",   value: formatNaira(totalUnliquidated), color: "text-amber-400" },
                ].map((c) => (
                  <div key={c.label} className="surface-card p-5 text-center">
                    <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{c.label}</p>
                    <p className={cn("font-orbitron text-xl font-bold tabular-nums", c.color)}>{c.value}</p>
                    {c.label === "Approved (Unliquidated)" && (
                      <p className="text-white/20 text-[10px] font-helvetica mt-1">AP — not yet cash</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="surface-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Monthly P&amp;L — {year}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Month</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Revenue (excl. VAT)</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Expenses</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Net Profit</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {plData.map((r) => (
                        <tr key={r.month} className="hover:bg-white/[0.02]">
                          <td className="px-5 py-3 text-sm text-white font-helvetica">{r.month}</td>
                          <td className="px-5 py-3 text-sm text-emerald-400 font-helvetica text-right tabular-nums">{formatNaira(r.revenue)}</td>
                          <td className="px-5 py-3 text-sm text-red-400 font-helvetica text-right tabular-nums">{formatNaira(r.expenses)}</td>
                          <td className={cn("px-5 py-3 text-sm font-semibold font-helvetica text-right tabular-nums", r.profit >= 0 ? "text-white" : "text-red-400")}>{formatNaira(r.profit)}</td>
                          <td className="px-5 py-3 text-xs text-white/40 font-helvetica text-right">
                            {r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-white/20 bg-white/[0.02]">
                        <td className="px-5 py-3 text-sm font-bold text-white font-orbitron">TOTAL</td>
                        <td className="px-5 py-3 text-sm font-bold text-emerald-400 font-helvetica text-right">{formatNaira(totalRevenue)}</td>
                        <td className="px-5 py-3 text-sm font-bold text-red-400 font-helvetica text-right">{formatNaira(totalExpenses)}</td>
                        <td className={cn("px-5 py-3 text-sm font-bold font-helvetica text-right", totalProfit >= 0 ? "text-secondary" : "text-red-400")}>{formatNaira(totalProfit)}</td>
                        <td className="px-5 py-3 text-xs text-white/40 font-helvetica text-right">
                          {totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* AR Aging */}
          {tab === "ar" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.entries(arBuckets) as [string, number][]).map(([bucket, amount]) => (
                  <div key={bucket} className="surface-card p-5 text-center">
                    <p className="text-white/40 text-xs font-helvetica mb-2">{bucket} days</p>
                    <p className="font-orbitron text-sm font-bold text-amber-400 tabular-nums">{formatNaira(amount)}</p>
                  </div>
                ))}
              </div>
              <div className="surface-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Accounts Receivable Aging ({arRows.length} invoices)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Invoice #</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Client</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Due Date</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase font-helvetica">Amount</th>
                        <th className="px-5 py-3 text-center text-[10px] font-semibold text-white/30 uppercase font-helvetica">Status</th>
                        <th className="px-5 py-3 text-center text-[10px] font-semibold text-white/30 uppercase font-helvetica">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {arRows.length === 0 ? (
                        <tr><td colSpan={6} className="px-5 py-12 text-center text-white/20 text-sm font-helvetica">No outstanding receivables.</td></tr>
                      ) : arRows.map((inv) => (
                        <tr key={inv.id} className="hover:bg-white/[0.02]">
                          <td className="px-5 py-3 font-orbitron text-xs text-accent">{inv.invoiceNumber}</td>
                          <td className="px-5 py-3 text-sm text-white font-helvetica">{inv.client.name}</td>
                          <td className="px-5 py-3 text-xs text-white/40 font-helvetica">{formatDate(inv.dueDate)}</td>
                          <td className="px-5 py-3 text-sm font-semibold text-white font-helvetica text-right">{formatNaira(inv.total)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-helvetica capitalize",
                              inv.status === "overdue" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            )}>{inv.status}</span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                              ageBucket(inv.dueDate) === "90+" ? "bg-red-500/15 text-red-400 border-red-500/30"
                              : ageBucket(inv.dueDate) === "61-90" ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                              : "bg-white/8 text-white/40 border-white/15"
                            )}>{ageBucket(inv.dueDate)} days</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* AP Aging */}
          {tab === "ap" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.entries(apBuckets) as [string, number][]).map(([bucket, amount]) => (
                  <div key={bucket} className="surface-card p-5 text-center">
                    <p className="text-white/40 text-xs font-helvetica mb-2">{bucket} days</p>
                    <p className="font-orbitron text-sm font-bold text-red-400 tabular-nums">{formatNaira(amount)}</p>
                  </div>
                ))}
              </div>
              <div className="surface-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Accounts Payable Aging — Approved Expenses ({apRows.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Title</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Category</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Submitted By</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase font-helvetica">Date</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase font-helvetica">Amount</th>
                        <th className="px-5 py-3 text-center text-[10px] font-semibold text-white/30 uppercase font-helvetica">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {apRows.length === 0 ? (
                        <tr><td colSpan={6} className="px-5 py-12 text-center text-white/20 text-sm font-helvetica">No outstanding payables.</td></tr>
                      ) : apRows.map((exp) => (
                        <tr key={exp.id} className="hover:bg-white/[0.02]">
                          <td className="px-5 py-3 text-sm text-white font-helvetica">{exp.title}</td>
                          <td className="px-5 py-3 text-xs text-white/50 font-helvetica capitalize">{exp.category}</td>
                          <td className="px-5 py-3 text-xs text-white/50 font-helvetica">{exp.submittedBy}</td>
                          <td className="px-5 py-3 text-xs text-white/40 font-helvetica">{exp.date}</td>
                          <td className="px-5 py-3 text-sm font-semibold text-white font-helvetica text-right">{formatNaira(exp.amount)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                              ageBucket(exp.date) === "90+" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-white/8 text-white/40 border-white/15"
                            )}>{ageBucket(exp.date)} days</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Revenue by Client */}
          {tab === "revenue" && (
            <div className="surface-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Revenue by Client — {year}</h2>
              </div>
              {revenueClientRows.length === 0 ? (
                <div className="px-5 py-12 text-center"><p className="text-white/20 text-sm font-helvetica">No paid invoices for {year}.</p></div>
              ) : (
                <div className="divide-y divide-white/5">
                  {revenueClientRows.map(([client, total], idx) => (
                    <div key={client} className="flex items-center gap-4 px-5 py-3.5">
                      <span className="text-white/20 text-xs font-orbitron w-6 shrink-0">#{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white font-helvetica">{client}</p>
                        <div className="mt-1.5 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-accent/60 rounded-full" style={{ width: `${(total / totalRevenue) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-white font-helvetica tabular-nums">{formatNaira(total)}</p>
                        <p className="text-[10px] text-white/30 font-helvetica">{((total / totalRevenue) * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReconcileIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
    </svg>
  );
}
