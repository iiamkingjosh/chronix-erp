"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, isRootAdmin, resolveRole, ROLES } from "@/types/roles";
import { getAllLoans, approveLoan, rejectLoan } from "@/lib/loans-service";
import type { StaffLoan, StaffLoanStatus } from "@/types/loans";
import { formatNaira } from "@/types/finance";
import { formatHrDate } from "@/types/hr";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<StaffLoanStatus, string> = {
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed: "bg-white/8 text-white/30 border-white/10",
  rejected:  "bg-red-500/15 text-red-400 border-red-500/30",
};

const TABS: { label: string; value: StaffLoanStatus | "all" }[] = [
  { label: "All",       value: "all" },
  { label: "Pending",   value: "pending" },
  { label: "Active",    value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Rejected",  value: "rejected" },
];

export default function HRLoansPage() {
  const { profile } = useAuth();
  const router      = useRouter();

  const [loans, setLoans]         = useState<StaffLoan[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<StaffLoanStatus | "all">("all");
  const [actionId, setActionId]   = useState<string | null>(null);
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionErr, setActionErr] = useState<string | null>(null);

  const canManage  = profile ? hasPermission(profile.role, "manage:hr") : false;
  const isCEO      = profile ? resolveRole(profile.role) === ROLES.CEO : false;
  const canAccess  = canManage || isCEO;
  const canApprove = profile ? isRootAdmin(profile.role) || isCEO : false;

  useEffect(() => {
    if (profile && !canAccess) { router.replace("/dashboard"); return; }
    if (!profile) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setLoans(await getAllLoans());
    } catch {
      setError("Failed to load loans. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(loanId: string) {
    if (!profile || !canApprove) return;
    setActionId(loanId);
    setActionErr(null);
    try {
      await approveLoan(loanId, profile.uid);
      setLoans((prev) => prev.map((l) => l.id === loanId ? { ...l, status: "approved" as const } : l));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setActionId(null);
    }
  }

  async function handleReject() {
    if (!profile || !canApprove || !rejectId || !rejectReason.trim()) return;
    setActionId(rejectId);
    setActionErr(null);
    try {
      await rejectLoan(rejectId, rejectReason.trim(), profile.uid);
      setLoans((prev) => prev.map((l) => l.id === rejectId ? { ...l, status: "rejected" as const } : l));
      setRejectId(null);
      setRejectReason("");
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Rejection failed.");
    } finally {
      setActionId(null);
    }
  }

  const filtered = tab === "all" ? loans : loans.filter((l) => l.status === tab);
  const outstanding = loans.filter((l) => l.status === "active").reduce((s, l) => s + l.balance, 0);
  const pendingCount = loans.filter((l) => l.status === "pending").length;
  const activeCount  = loans.filter((l) => l.status === "active").length;

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="surface-card p-5 h-20 animate-pulse" />)}
        </div>
        <div className="surface-card h-64 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card p-10 text-center">
        <p className="text-red-400 text-sm font-helvetica mb-4">{error}</p>
        <button onClick={load} className="text-accent text-sm font-helvetica hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-accent">{formatNaira(outstanding)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total Outstanding</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className={cn("font-orbitron text-2xl font-bold", pendingCount > 0 ? "text-amber-400" : "text-white/30")}>
            {pendingCount}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Pending Applications</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-emerald-400">{activeCount}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Active Loans</p>
        </div>
      </div>

      {actionErr && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 font-helvetica flex items-center justify-between gap-3">
          <span>{actionErr}</span>
          <button onClick={() => setActionErr(null)} className="text-white/30 hover:text-white">✕</button>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "px-4 py-2 text-xs font-medium font-helvetica rounded-lg transition-all whitespace-nowrap",
              tab === t.value
                ? "bg-accent/15 text-accent border border-accent/20"
                : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            {t.label}
            {t.value !== "all" && loans.filter((l) => l.status === t.value).length > 0 && (
              <span className="ml-1.5 font-orbitron text-[9px]">
                ({loans.filter((l) => l.status === t.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loan list */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {loans.length === 0 ? "No loan applications yet." : `No ${tab === "all" ? "" : tab} loans.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Employee</th>
                  <th className="px-5 py-4 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount</th>
                  <th className="px-5 py-4 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Balance</th>
                  <th className="px-5 py-4 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Monthly</th>
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Applied</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((loan) => (
                  <tr key={loan.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-white font-helvetica">{loan.employeeName}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica text-right">{formatNaira(loan.amount)}</td>
                    <td className="px-5 py-3.5 text-sm font-helvetica text-right">
                      <span className={cn(loan.balance > 0 ? "text-amber-300" : "text-white/30")}>
                        {formatNaira(loan.balance)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica text-right">{formatNaira(loan.monthlyInstalment)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatHrDate(loan.applicationDate)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", STATUS_STYLES[loan.status])}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {canApprove && loan.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleApprove(loan.id)}
                              disabled={actionId === loan.id}
                              className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40"
                            >
                              {actionId === loan.id ? "…" : "Approve"}
                            </button>
                            <button
                              onClick={() => { setRejectId(loan.id); setRejectReason(""); }}
                              disabled={actionId === loan.id}
                              className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <Link
                          href={`/dashboard/hr/loans/${loan.id}`}
                          className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setRejectId(null)}>
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-orbitron text-base font-bold text-white mb-1">Reject Loan Application</h2>
            <p className="text-xs text-white/40 font-helvetica mb-4">
              {loans.find((l) => l.id === rejectId)?.employeeName}
            </p>
            <label className="field-label">Reason (required)</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this application is being rejected…"
              className="input-field resize-none mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || !!actionId}
                className="flex-1 text-sm text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
              >
                {actionId ? "Rejecting…" : "Confirm Rejection"}
              </button>
              <button
                onClick={() => setRejectId(null)}
                className="text-sm text-white/40 hover:text-white font-helvetica transition-colors px-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
