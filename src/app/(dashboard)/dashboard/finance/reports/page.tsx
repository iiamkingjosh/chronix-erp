"use client";

import { useEffect, useState } from "react";
import { getInvoices, getPayments } from "@/lib/finance-service";
import { getExpenses } from "@/lib/expense-service";
import { formatNaira, formatDate } from "@/types/finance";
import type { Invoice, Payment } from "@/types/finance";
import type { Expense } from "@/types/expense";
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
  const [loading, setLoading]     = useState(true);

  const canView = profile ? hasPermission(profile.role, "view:finance") || hasPermission(profile.role, "view:reports") : false;

  useEffect(() => {
    Promise.all([getInvoices(), getPayments(), getExpenses()])
      .then(([inv, pay, exp]) => { setInvoices(inv); setPayments(pay); setExpenses(exp); })
      .finally(() => setLoading(false));
  }, []);

  if (!canView) return <div className="p-8 text-white/40 font-helvetica">Access restricted.</div>;

  /* ── P&L helpers ── */
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const plData = MONTHS.map((month, mi) => {
    const period = `${year}-${String(mi + 1).padStart(2, "0")}`;
    const revenue  = invoices.filter((i) => i.status === "paid" && i.invoiceDate?.startsWith(period)).reduce((s, i) => s + i.total, 0);
    const expTotal = expenses.filter((e) => (e.status === "approved" || e.status === "paid") && e.date?.startsWith(period)).reduce((s, e) => s + e.amount, 0);
    return { month, revenue, expenses: expTotal, profit: revenue - expTotal };
  });

  const totalRevenue  = plData.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = plData.reduce((s, r) => s + r.expenses, 0);
  const totalProfit   = totalRevenue - totalExpenses;

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
      acc[i.client.name] = (acc[i.client.name] ?? 0) + i.total;
      return acc;
    }, {});
  const revenueClientRows = Object.entries(revenueByClient).sort((a, b) => b[1] - a[1]);

  /* ── Exports ── */
  function exportPL() {
    exportCSV(
      [["Month", "Revenue (₦)", "Expenses (₦)", "Profit (₦)"],
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

  const tabs: { v: ReportTab; label: string }[] = [
    { v: "pl",      label: "P&L Statement" },
    { v: "ar",      label: "AR Aging" },
    { v: "ap",      label: "AP Aging" },
    { v: "revenue", label: "Revenue by Client" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
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
          <button onClick={() => window.print()} className="text-xs text-white/60 hover:text-white font-helvetica border border-white/15 hover:border-white/30 px-3 py-2 rounded-lg transition-colors">
            Print / PDF
          </button>
        </div>
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
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total Revenue",  value: formatNaira(totalRevenue),  color: "text-emerald-400" },
                  { label: "Total Expenses", value: formatNaira(totalExpenses), color: "text-red-400" },
                  { label: "Net Profit",     value: formatNaira(totalProfit),   color: totalProfit >= 0 ? "text-secondary" : "text-red-400" },
                ].map((c) => (
                  <div key={c.label} className="surface-card p-5 text-center">
                    <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{c.label}</p>
                    <p className={cn("font-orbitron text-xl font-bold tabular-nums", c.color)}>{c.value}</p>
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
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Revenue</th>
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
