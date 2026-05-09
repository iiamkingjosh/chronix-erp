"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getExpenses, getMyExpenses, updateExpenseStatus } from "@/lib/expense-service";
import { formatNaira } from "@/types/finance";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_STYLES } from "@/types/expense";
import type { Expense, ExpenseStatus } from "@/types/expense";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

type Filter = "all" | ExpenseStatus;

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ExpensesPage() {
  const { profile }               = useAuth();
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<Filter>("all");
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing]       = useState<string | null>(null);

  const canManage  = profile
    ? isRootAdmin(profile.role) || hasPermission(profile.role, "manage:finance") || profile.role === "CEO"
    : false;
  const canApprove = profile
    ? isRootAdmin(profile.role) || profile.role === "CFO" || profile.role === "CEO" || profile.role === "System Admin"
    : false;

  useEffect(() => {
    if (!profile) return;
    const load = canManage ? getExpenses() : getMyExpenses(profile.uid);
    load.then(setExpenses).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, canManage]);

  const filtered = filter === "all" ? expenses : expenses.filter((e) => e.status === filter);
  const totalPending  = expenses.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const totalApproved = expenses.filter((e) => e.status === "approved").reduce((s, e) => s + e.amount, 0);

  async function handleApprove(id: string) {
    if (!profile) return;
    setActing(id);
    await updateExpenseStatus(id, "approved", profile.displayName ?? profile.email);
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, status: "approved" as ExpenseStatus, approvedBy: profile.displayName ?? profile.email } : e));
    setActing(null);
  }

  async function handleReject() {
    if (!rejectId || !profile || !rejectReason.trim()) return;
    setActing(rejectId);
    await updateExpenseStatus(rejectId, "rejected", profile.displayName ?? profile.email, { rejectionReason: rejectReason });
    setExpenses((prev) => prev.map((e) => e.id === rejectId ? { ...e, status: "rejected" as ExpenseStatus } : e));
    setActing(null);
    setRejectId(null);
    setRejectReason("");
  }

  async function handleMarkPaid(id: string) {
    if (!profile) return;
    setActing(id);
    await updateExpenseStatus(id, "paid", profile.displayName ?? profile.email);
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, status: "paid" as ExpenseStatus } : e));
    setActing(null);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-4">Reject Expense</h3>
            <label className="field-label">Reason</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="input-field resize-none mb-4" placeholder="Explain why this expense is rejected…" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-primary text-xs px-5">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Expense Claims</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Submit and track expense reimbursements</p>
        </div>
        <Link href="/dashboard/finance/expenses/new" className="btn-primary text-xs px-4 py-2.5">+ New Expense</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-white">{expenses.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total Claims</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-amber-400">{expenses.filter((e) => e.status === "pending").length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Awaiting Approval</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-sm font-bold text-amber-400">{formatNaira(totalPending)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Pending Amount</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-sm font-bold text-emerald-400">{formatNaira(totalApproved)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Approved Amount</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {(["all", "pending", "approved", "rejected", "paid"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
              filter === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f === "all" ? "All" : f}
            <span className="ml-1.5 text-[10px] opacity-60">
              {f === "all" ? expenses.length : expenses.filter((e) => e.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No expense claims found.</p>
              <Link href="/dashboard/finance/expenses/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">Submit your first expense →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Title</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Category</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Submitted By</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                    <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                    <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((exp) => (
                    <tr key={exp.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-white font-helvetica">{exp.title}</p>
                        {exp.description && <p className="text-xs text-white/30 font-helvetica truncate max-w-xs">{exp.description}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{EXPENSE_CATEGORY_LABELS[exp.category]}</td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{exp.submittedBy}</td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{fmt(exp.date)}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-white font-helvetica text-right">{formatNaira(exp.amount)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", EXPENSE_STATUS_STYLES[exp.status])}>
                          {exp.status}
                        </span>
                        {exp.status === "rejected" && exp.rejectionReason && (
                          <p className="text-[10px] text-red-300/60 font-helvetica mt-0.5">{exp.rejectionReason}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {canApprove && exp.status === "pending" && (
                            <>
                              <button onClick={() => handleApprove(exp.id)} disabled={acting === exp.id}
                                className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                                {acting === exp.id ? "…" : "Approve"}
                              </button>
                              <button onClick={() => setRejectId(exp.id)}
                                className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors">
                                Reject
                              </button>
                            </>
                          )}
                          {canApprove && exp.status === "approved" && (
                            <button onClick={() => handleMarkPaid(exp.id)} disabled={acting === exp.id}
                              className="text-xs text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                              {acting === exp.id ? "…" : "Mark Paid"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
