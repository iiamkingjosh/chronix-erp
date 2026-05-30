"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoices } from "@/lib/finance-service";
import { getExpenses } from "@/lib/expense-service";
import { formatNaira, formatDate } from "@/types/finance";
import type { Invoice } from "@/types/finance";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize font-helvetica",
        status === "paid"    && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        status === "pending" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
        status === "overdue" && "bg-red-500/15 text-red-400 border-red-500/30"
      )}
    >
      {status}
    </span>
  );
}

function StatCard({
  label, value, sub, icon, iconClass, valueClass,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; iconClass: string; valueClass: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica">{label}</p>
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center shrink-0", iconClass)}>
          {icon}
        </div>
      </div>
      <p className={cn("font-orbitron text-xl font-bold", valueClass)}>{value}</p>
      <p className="text-white/30 text-xs font-helvetica mt-1">{sub}</p>
    </div>
  );
}

export default function FinanceDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getInvoices(), getExpenses()])
      .then(([invs, exps]) => {
        setInvoices(invs);
        const expTotal = exps
          .filter((e) => e.status === "approved" || e.status === "paid")
          .reduce((s, e) => s + e.amount, 0);
        setTotalExpenses(expTotal);
      })
      .finally(() => setLoading(false));
  }, []);

  const paid    = invoices.filter((i) => i.status === "paid");
  const pending = invoices.filter((i) => i.status === "pending");
  const overdue = invoices.filter((i) => i.status === "overdue");

  const totalRevenue = paid.reduce((s, i) => s + i.total, 0);
  const totalPending = pending.reduce((s, i) => s + i.total, 0);
  const totalOverdue = overdue.reduce((s, i) => s + i.total, 0);
  const netBalance   = totalRevenue - totalExpenses;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Revenue"
          value={formatNaira(totalRevenue)}
          sub={`${paid.length} paid invoice${paid.length !== 1 ? "s" : ""}`}
          icon={<RevenueIcon />}
          iconClass="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          valueClass="text-emerald-400"
        />
        <StatCard
          label="Total Expenses"
          value={formatNaira(totalExpenses)}
          sub="approved + paid claims"
          icon={<ExpensesIcon />}
          iconClass="bg-red-500/10 border-red-500/20 text-red-400"
          valueClass="text-red-400"
        />
        <StatCard
          label="Net Balance"
          value={formatNaira(Math.abs(netBalance))}
          sub={netBalance >= 0 ? "surplus" : "deficit"}
          icon={<BalanceIcon />}
          iconClass={netBalance >= 0 ? "bg-secondary/10 border-secondary/20 text-secondary" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}
          valueClass={netBalance >= 0 ? "text-secondary" : "text-amber-400"}
        />
        <StatCard
          label="Pending"
          value={formatNaira(totalPending)}
          sub={`${pending.length} invoice${pending.length !== 1 ? "s" : ""}`}
          icon={<PendingIcon />}
          iconClass="bg-amber-500/10 border-amber-500/20 text-amber-400"
          valueClass="text-amber-400"
        />
        <StatCard
          label="Overdue"
          value={formatNaira(totalOverdue)}
          sub={`${overdue.length} invoice${overdue.length !== 1 ? "s" : ""}`}
          icon={<OverdueIcon />}
          iconClass="bg-red-500/10 border-red-500/20 text-red-400"
          valueClass="text-red-400"
        />
        <StatCard
          label="Total Invoices"
          value={String(invoices.length)}
          sub="all time"
          icon={<InvoicesIcon />}
          iconClass="bg-white/5 border-white/10 text-white/40"
          valueClass="text-white"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/dashboard/finance/invoices/new" className="btn-primary">
          <PlusIcon /> New Invoice
        </Link>
        <Link
          href="/dashboard/finance/payments"
          className="flex items-center gap-2 px-5 py-3 border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/20 text-sm font-helvetica transition-all"
        >
          Record Payment
        </Link>
        <Link
          href="/dashboard/finance/expenses/new"
          className="flex items-center gap-2 px-5 py-3 border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/20 text-sm font-helvetica transition-all"
        >
          Log Expense
        </Link>
      </div>

      {/* Recent invoices */}
      <div className="surface-card">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
            Recent Invoices
          </h2>
          <Link
            href="/dashboard/finance/invoices"
            className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors"
          >
            View all →
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No invoices yet.</p>
            <Link
              href="/dashboard/finance/invoices/new"
              className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline"
            >
              Create your first invoice →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Invoice #", "Client", "Date", "Amount", "Status"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-6 py-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica",
                        h === "Amount" ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.slice(0, 6).map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/finance/invoices/${inv.id}`}
                        className="font-orbitron text-xs text-accent hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-helvetica">
                      {inv.client.name}
                    </td>
                    <td className="px-6 py-4 text-xs text-white/40 font-helvetica">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-helvetica font-semibold text-right">
                      {formatNaira(inv.total)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpensesIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><line x1="5" y1="5" x2="19" y2="19" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function BalanceIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function RevenueIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}
function PendingIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function OverdueIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function InvoicesIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}
function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
