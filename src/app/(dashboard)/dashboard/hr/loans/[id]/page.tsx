"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, isRootAdmin, resolveRole, ROLES } from "@/types/roles";
import {
  getAllLoans, getLoanRepayments,
  approveLoan, rejectLoan, disburseLoan, earlyRepayment,
} from "@/lib/loans-service";
import type { StaffLoan, StaffLoanRepayment, StaffLoanStatus } from "@/types/loans";
import { formatNaira } from "@/types/finance";
import { formatHrDate, formatHrDateTime } from "@/types/hr";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<StaffLoanStatus, string> = {
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed: "bg-white/8 text-white/30 border-white/10",
  rejected:  "bg-red-500/15 text-red-400 border-red-500/30",
};

type ModalKind = "reject" | "disburse" | "early_repayment" | null;

export default function LoanDetailPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [loan, setLoan]             = useState<StaffLoan | null>(null);
  const [repayments, setRepayments] = useState<StaffLoanRepayment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [modal, setModal]           = useState<ModalKind>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing]         = useState(false);
  const [actionErr, setActionErr]   = useState<string | null>(null);

  const canManage  = profile ? hasPermission(profile.role, "manage:hr") : false;
  const isCEO      = profile ? resolveRole(profile.role) === ROLES.CEO : false;
  const canApprove = profile ? isRootAdmin(profile.role) || isCEO : false;
  const isSelf     = profile ? loan?.employeeUid === profile.uid : false;
  const canAccess  = canManage || isCEO || isSelf;

  useEffect(() => {
    if (!profile) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile?.uid]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await getAllLoans();
      const found = all.find((l) => l.id === id) ?? null;
      setLoan(found);
      if (found) {
        setRepayments(await getLoanRepayments(id));
      }
      // Redirect if found but no access
      if (found && profile) {
        const self = found.employeeUid === profile.uid;
        if (!canManage && !isCEO && !self) { router.replace("/dashboard"); return; }
      }
    } catch {
      setError("Failed to load loan details. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!profile || !loan || !canApprove) return;
    setActing(true);
    setActionErr(null);
    try {
      await approveLoan(loan.id, profile.uid);
      setLoan((l) => l ? { ...l, status: "approved" } : l);
      setModal(null);
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActing(false); }
  }

  async function handleReject() {
    if (!profile || !loan || !canApprove || !rejectReason.trim()) return;
    setActing(true);
    setActionErr(null);
    try {
      await rejectLoan(loan.id, rejectReason.trim(), profile.uid);
      setLoan((l) => l ? { ...l, status: "rejected" } : l);
      setModal(null);
      setRejectReason("");
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActing(false); }
  }

  async function handleDisburse() {
    if (!profile || !loan || !canApprove) return;
    setActing(true);
    setActionErr(null);
    try {
      const updated = await disburseLoan(loan.id, profile.uid);
      setLoan(updated);
      setModal(null);
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActing(false); }
  }

  async function handleEarlyRepayment() {
    if (!profile || !loan || !canApprove) return;
    setActing(true);
    setActionErr(null);
    try {
      const updated = await earlyRepayment(loan.id, profile.uid);
      setLoan(updated);
      const refreshed = await getLoanRepayments(loan.id);
      setRepayments(refreshed);
      setModal(null);
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActing(false); }
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="surface-card h-52 animate-pulse" />
        <div className="surface-card h-48 animate-pulse" />
      </div>
    );
  }
  if (error || !loan) {
    return (
      <div className="surface-card p-10 text-center">
        <p className="text-red-400 text-sm font-helvetica mb-4">{error ?? "Loan not found."}</p>
        {error ? (
          <button onClick={load} className="text-accent text-sm font-helvetica hover:underline">Retry</button>
        ) : (
          <button onClick={() => router.back()} className="text-accent text-sm font-helvetica hover:underline">Go back</button>
        )}
      </div>
    );
  }

  if (!canAccess) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Access restricted.</p></div>;
  }

  const progressPct = loan.amount > 0 ? Math.min(100, Math.round((loan.amountRepaid / loan.amount) * 100)) : 0;

  return (
    <div className="animate-fade-in max-w-4xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back
      </button>

      {actionErr && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 font-helvetica flex items-center justify-between gap-3">
          <span>{actionErr}</span>
          <button onClick={() => setActionErr(null)} className="text-white/30 hover:text-white">✕</button>
        </div>
      )}

      {/* Loan summary */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h2 className="font-orbitron text-xl font-bold text-white">{loan.employeeName}</h2>
            <p className="text-white/40 text-xs font-helvetica mt-1">Loan application — {formatHrDate(loan.applicationDate)}</p>
          </div>
          <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border font-helvetica capitalize", STATUS_STYLES[loan.status])}>
            {loan.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Amount</p>
            <p className="font-orbitron text-lg font-bold text-white">{formatNaira(loan.amount)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Balance</p>
            <p className="font-orbitron text-lg font-bold text-amber-300">{formatNaira(loan.balance)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Monthly</p>
            <p className="font-orbitron text-lg font-bold text-accent">{formatNaira(loan.monthlyInstalment)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Repaid</p>
            <p className="font-orbitron text-lg font-bold text-emerald-400">{formatNaira(loan.amountRepaid)}</p>
          </div>
        </div>

        {loan.status === "active" && (
          <div className="mb-5">
            <div className="flex justify-between text-xs font-helvetica text-white/40 mb-1.5">
              <span>Repayment Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm border-t border-white/5 pt-5">
          <div>
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Period</p>
            <p className="text-white/70 font-helvetica">{loan.repaymentMonths} months</p>
          </div>
          {loan.carryover > 0 && (
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Carryover</p>
              <p className="text-amber-400 font-helvetica">{formatNaira(loan.carryover)}</p>
            </div>
          )}
          {loan.approvedAt && (
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Approved</p>
              <p className="text-white/70 font-helvetica">{formatHrDate(loan.approvedAt)}</p>
            </div>
          )}
          {loan.disbursedAt && (
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Disbursed</p>
              <p className="text-white/70 font-helvetica">{formatHrDate(loan.disbursedAt)}</p>
            </div>
          )}
          {loan.completedAt && (
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Completed</p>
              <p className="text-emerald-400 font-helvetica">{formatHrDate(loan.completedAt)}</p>
            </div>
          )}
          {loan.rejectionReason && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Rejection Reason</p>
              <p className="text-red-300 font-helvetica text-xs">{loan.rejectionReason}</p>
            </div>
          )}
          <div className="col-span-2 sm:col-span-3">
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Reason for Loan</p>
            <p className="text-white/60 font-helvetica text-sm">{loan.reason}</p>
          </div>
          {loan.notes && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-white/60 font-helvetica text-sm">{loan.notes}</p>
            </div>
          )}
        </div>

        {/* Action buttons — CEO/Root Admin only */}
        {canApprove && (
          <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/5">
            {loan.status === "pending" && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="text-sm text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 px-4 py-2 rounded-xl font-helvetica transition-colors disabled:opacity-40"
                >
                  {acting ? "Approving…" : "✓ Approve"}
                </button>
                <button
                  onClick={() => { setModal("reject"); setRejectReason(""); }}
                  className="text-sm text-red-400 border border-red-500/20 hover:bg-red-500/10 px-4 py-2 rounded-xl font-helvetica transition-colors"
                >
                  ✕ Reject
                </button>
              </>
            )}
            {loan.status === "approved" && (
              <button
                onClick={() => setModal("disburse")}
                className="text-sm text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 px-4 py-2 rounded-xl font-helvetica transition-colors"
              >
                Mark as Disbursed
              </button>
            )}
            {loan.status === "active" && (
              <button
                onClick={() => setModal("early_repayment")}
                className="text-sm text-accent border border-accent/30 hover:bg-accent/10 px-4 py-2 rounded-xl font-helvetica transition-colors"
              >
                Record Early Repayment
              </button>
            )}
          </div>
        )}
      </div>

      {/* Repayment history */}
      <div className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">Repayment History</h2>
        </div>
        {repayments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-white/20 text-sm font-helvetica">No repayments recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                  <th className="px-5 py-3 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Type</th>
                  <th className="px-5 py-3 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount Due</th>
                  <th className="px-5 py-3 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Deducted</th>
                  <th className="px-5 py-3 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Shortfall</th>
                  <th className="px-5 py-3 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Payroll Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {repayments.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-xs text-white/60 font-helvetica">{formatHrDate(r.repaymentDate)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                        r.type === "early_repayment"
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-white/8 text-white/50 border-white/10"
                      )}>
                        {r.type === "early_repayment" ? "Early" : "Payroll"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica text-right">{formatNaira(r.amountDue)}</td>
                    <td className="px-5 py-3.5 text-sm text-emerald-400 font-helvetica text-right">{formatNaira(r.amountDeducted)}</td>
                    <td className="px-5 py-3.5 text-sm font-helvetica text-right">
                      {r.shortfall > 0
                        ? <span className="text-amber-400">{formatNaira(r.shortfall)}</span>
                        : <span className="text-white/20">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica font-orbitron">
                      {r.payrollRunId ? r.payrollRunId.slice(-8).toUpperCase() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "reject" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-orbitron text-base font-bold text-white mb-4">Reject Application</h2>
            <label className="field-label">Reason (required)</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this application is being rejected…"
              className="input-field resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || acting}
                className="flex-1 text-sm text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
              >
                {acting ? "Rejecting…" : "Confirm Rejection"}
              </button>
              <button onClick={() => setModal(null)} className="text-sm text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modal === "disburse" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-orbitron text-base font-bold text-white mb-2">Confirm Disbursement</h2>
            <p className="text-sm text-white/60 font-helvetica mb-6">
              Confirm that <span className="text-white font-semibold">{formatNaira(loan.amount)}</span> has been transferred to{" "}
              <span className="text-white font-semibold">{loan.employeeName}</span>&apos;s bank account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDisburse}
                disabled={acting}
                className="flex-1 text-sm text-white bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
              >
                {acting ? "Confirming…" : "Yes, Mark as Disbursed"}
              </button>
              <button onClick={() => setModal(null)} className="text-sm text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modal === "early_repayment" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-orbitron text-base font-bold text-white mb-2">Record Early Repayment</h2>
            <p className="text-sm text-white/60 font-helvetica mb-6">
              This will clear the remaining balance of{" "}
              <span className="text-accent font-semibold font-orbitron">{formatNaira(loan.balance)}</span> and mark the loan as completed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleEarlyRepayment}
                disabled={acting}
                className="flex-1 text-sm text-white bg-accent hover:bg-accent/90 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
              >
                {acting ? "Processing…" : "Confirm Early Repayment"}
              </button>
              <button onClick={() => setModal(null)} className="text-sm text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
