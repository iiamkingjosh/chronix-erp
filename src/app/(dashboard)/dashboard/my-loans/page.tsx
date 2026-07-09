"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getActiveLoanForEmployee, getLoanRepayments,
  applyForLoan, earlyRepayment, getAllLoans,
} from "@/lib/loans-service";
import type { StaffLoan, StaffLoanRepayment } from "@/types/loans";
import { formatNaira } from "@/types/finance";
import { formatHrDate } from "@/types/hr";
import { cn } from "@/lib/utils";

const MAX_LOAN = 500_000;
const MONTH_OPTIONS = [4,5,6,7,8,9,10,11,12,15,18,24] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function MyLoansPage() {
  const { profile } = useAuth();

  const [loan, setLoan]             = useState<StaffLoan | null | "none">("none");
  const [repayments, setRepayments] = useState<StaffLoanRepayment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Application form
  const [amount, setAmount]       = useState("");
  const [months, setMonths]       = useState<number>(12);
  const [reason, setReason]       = useState("");
  const [applying, setApplying]   = useState(false);
  const [applyErr, setApplyErr]   = useState<string | null>(null);
  const [applyOk, setApplyOk]     = useState(false);

  // Early repayment
  const [earlyModal, setEarlyModal] = useState(false);
  const [earlyActing, setEarlyActing] = useState(false);
  const [earlyErr, setEarlyErr]     = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      // First check for active/in-progress loan
      const active = await getActiveLoanForEmployee(profile.uid);
      if (active) {
        setLoan(active);
        if (active.status === "active") {
          setRepayments(await getLoanRepayments(active.id));
        }
        return;
      }
      // Check for completed or rejected loans
      const all = await getAllLoans();
      const mine = all.filter((l) => l.employeeUid === profile.uid);
      const completed = mine.find((l) => l.status === "completed");
      if (completed) {
        setLoan(completed);
        setRepayments(await getLoanRepayments(completed.id));
        return;
      }
      const rejected = mine.find((l) => l.status === "rejected");
      if (rejected) {
        setLoan(rejected);
        return;
      }
      setLoan(null);
    } catch {
      setError("Failed to load loan information. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const amt = Number(amount);
    if (!amt || amt <= 0 || amt > MAX_LOAN) {
      setApplyErr(`Amount must be between ₦1 and ${formatNaira(MAX_LOAN)}.`);
      return;
    }
    if (!reason.trim()) { setApplyErr("Reason is required."); return; }
    setApplying(true);
    setApplyErr(null);
    try {
      const created = await applyForLoan(
        profile.uid,
        profile.displayName ?? profile.email ?? "Unknown",
        amt,
        months,
        reason.trim(),
        profile.uid,
      );
      setLoan(created);
      setApplyOk(true);
    } catch (err) {
      setApplyErr(err instanceof Error ? err.message : "Application failed. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  async function handleEarlyRepayment() {
    if (!profile || !loan || loan === "none" || typeof loan === "string") return;
    setEarlyActing(true);
    setEarlyErr(null);
    try {
      const updated = await earlyRepayment(loan.id, profile.uid);
      setLoan(updated);
      setRepayments(await getLoanRepayments(loan.id));
      setEarlyModal(false);
    } catch (e) {
      setEarlyErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setEarlyActing(false);
    }
  }

  const instalment = amount && Number(amount) > 0 && months > 0
    ? round2(Number(amount) / months)
    : 0;

  if (loading) {
    return (
      <div className="animate-fade-in max-w-2xl space-y-4">
        <div className="surface-card h-40 animate-pulse" />
        <div className="surface-card h-24 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card max-w-2xl p-10 text-center">
        <p className="text-red-400 text-sm font-helvetica mb-4">{error}</p>
        <button onClick={load} className="text-accent text-sm font-helvetica hover:underline">Retry</button>
      </div>
    );
  }

  // ── No loan ever / rejected → show application form ──
  if (!loan) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-lg font-bold text-white mb-1">Apply for a Loan</h2>
          <p className="text-white/40 text-xs font-helvetica mb-6">Maximum amount: {formatNaira(MAX_LOAN)}</p>

          {applyOk ? (
            <div className="text-center py-8">
              <p className="text-emerald-400 font-semibold font-helvetica mb-2">Application submitted successfully!</p>
              <p className="text-white/40 text-xs font-helvetica">Your application is under review by HR.</p>
            </div>
          ) : (
            <form onSubmit={handleApply} className="space-y-5">
              <div>
                <label className="field-label">Loan Amount (₦)</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_LOAN}
                  step={1000}
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setApplyErr(null); }}
                  placeholder={`Up to ${formatNaira(MAX_LOAN)}`}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="field-label">Repayment Period</label>
                <select
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="input-field"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m} className="bg-primary-dark">{m} months</option>
                  ))}
                </select>
                {instalment > 0 && (
                  <p className="mt-1.5 text-xs text-accent font-helvetica">
                    Your monthly deduction: <span className="font-orbitron font-bold">{formatNaira(instalment)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="field-label">Reason for Loan</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setApplyErr(null); }}
                  placeholder="Briefly describe why you need this loan…"
                  className="input-field resize-none"
                  required
                />
              </div>

              {applyErr && <p className="text-xs text-red-400 font-helvetica">{applyErr}</p>}

              <button
                type="submit"
                disabled={applying}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {applying ? "Submitting…" : "Submit Application"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Pending ──
  if (loan !== "none" && loan.status === "pending") {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <ClockIcon />
            </div>
            <div>
              <h2 className="font-orbitron text-base font-bold text-white">Application Under Review</h2>
              <p className="text-white/40 text-xs font-helvetica">Submitted {formatHrDate(loan.applicationDate)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 bg-white/[0.03] rounded-xl">
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Amount Requested</p>
              <p className="font-orbitron text-lg font-bold text-white">{formatNaira(loan.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Period</p>
              <p className="font-orbitron text-lg font-bold text-white">{loan.repaymentMonths} months</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Reason</p>
              <p className="text-white/60 font-helvetica text-sm">{loan.reason}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-white/30 font-helvetica">You will be notified once HR reviews your application.</p>
        </div>
      </div>
    );
  }

  // ── Approved — awaiting disbursement ──
  if (loan !== "none" && loan.status === "approved") {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <CheckIcon />
            </div>
            <div>
              <h2 className="font-orbitron text-base font-bold text-white">Approved — Awaiting Disbursement</h2>
              <p className="text-white/40 text-xs font-helvetica">Approved {loan.approvedAt ? formatHrDate(loan.approvedAt) : ""}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 bg-white/[0.03] rounded-xl">
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Amount</p>
              <p className="font-orbitron text-lg font-bold text-white">{formatNaira(loan.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Monthly Instalment</p>
              <p className="font-orbitron text-lg font-bold text-accent">{formatNaira(loan.monthlyInstalment)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-white/30 font-helvetica">HR will transfer the funds to your account and mark it as disbursed.</p>
        </div>
      </div>
    );
  }

  // ── Active ──
  if (loan !== "none" && loan.status === "active") {
    const progressPct = loan.amount > 0 ? Math.min(100, Math.round((loan.amountRepaid / loan.amount) * 100)) : 0;
    return (
      <div className="animate-fade-in max-w-2xl space-y-5">
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-lg font-bold text-white mb-5">My Active Loan</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Borrowed</p>
              <p className="font-orbitron text-lg font-bold text-white">{formatNaira(loan.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Balance</p>
              <p className="font-orbitron text-lg font-bold text-amber-300">{formatNaira(loan.balance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Repaid</p>
              <p className="font-orbitron text-lg font-bold text-emerald-400">{formatNaira(loan.amountRepaid)}</p>
            </div>
          </div>

          <div className="mb-5">
            <div className="flex justify-between text-xs font-helvetica text-white/40 mb-1.5">
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl mb-4">
            <div>
              <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Monthly Deduction</p>
              <p className="font-orbitron text-base font-bold text-accent">{formatNaira(loan.monthlyInstalment)}</p>
            </div>
            {loan.carryover > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-0.5">Carryover</p>
                <p className="font-orbitron text-base font-bold text-amber-400">{formatNaira(loan.carryover)}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setEarlyModal(true)}
            className="w-full text-sm text-accent border border-accent/30 hover:bg-accent/10 py-2.5 rounded-xl font-helvetica font-semibold transition-colors"
          >
            Pay Full Balance Now
          </button>
        </div>

        {/* Repayment history */}
        {repayments.length > 0 && (
          <div className="surface-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/10">
              <p className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Repayment History</p>
            </div>
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
                      <td className="px-5 py-3 text-xs text-white/60 font-helvetica">{formatHrDate(r.repaymentDate)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                          r.type === "early_repayment"
                            ? "bg-accent/15 text-accent border-accent/30"
                            : "bg-white/8 text-white/50 border-white/10"
                        )}>
                          {r.type === "early_repayment" ? "Early" : "Payroll"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-white/60 font-helvetica text-right">{formatNaira(r.amountDue)}</td>
                      <td className="px-5 py-3 text-sm text-emerald-400 font-helvetica text-right">{formatNaira(r.amountDeducted)}</td>
                      <td className="px-5 py-3 text-sm font-helvetica text-right">
                        {r.shortfall > 0
                          ? <span className="text-amber-400">{formatNaira(r.shortfall)}</span>
                          : <span className="text-white/20">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs text-white/30 font-helvetica font-orbitron">
                        {r.payrollRunId ? r.payrollRunId.slice(-8).toUpperCase() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Early repayment modal */}
        {earlyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setEarlyModal(false)}>
            <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-orbitron text-base font-bold text-white mb-2">Pay Full Balance Now?</h2>
              <p className="text-sm text-white/60 font-helvetica mb-6">
                Pay <span className="text-accent font-orbitron font-bold">{formatNaira(loan.balance)}</span> to clear your loan in full?
              </p>
              {earlyErr && <p className="mb-4 text-xs text-red-400 font-helvetica">{earlyErr}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleEarlyRepayment}
                  disabled={earlyActing}
                  className="flex-1 text-sm text-white bg-accent hover:bg-accent/90 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
                >
                  {earlyActing ? "Processing…" : "Confirm Full Payment"}
                </button>
                <button onClick={() => setEarlyModal(false)} className="text-sm text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Completed ──
  if (loan !== "none" && loan.status === "completed") {
    return (
      <div className="animate-fade-in max-w-2xl space-y-5">
        <div className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckIcon />
            </div>
            <div>
              <h2 className="font-orbitron text-base font-bold text-white">Loan Fully Repaid</h2>
              {loan.completedAt && (
                <p className="text-white/40 text-xs font-helvetica">Completed {formatHrDate(loan.completedAt)}</p>
              )}
            </div>
          </div>
          <div className="p-4 bg-white/[0.03] rounded-xl">
            <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Total Repaid</p>
            <p className="font-orbitron text-xl font-bold text-emerald-400">{formatNaira(loan.amountRepaid)}</p>
          </div>
        </div>

        {repayments.length > 0 && (
          <div className="surface-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/10">
              <p className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Repayment History</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 py-3 text-left  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                    <th className="px-5 py-3 text-left  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Type</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount Due</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Deducted</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Shortfall</th>
                    <th className="px-5 py-3 text-left  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Payroll Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repayments.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-xs text-white/60 font-helvetica">{formatHrDate(r.repaymentDate)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                          r.type === "early_repayment"
                            ? "bg-accent/15 text-accent border-accent/30"
                            : "bg-white/8 text-white/50 border-white/10"
                        )}>
                          {r.type === "early_repayment" ? "Early" : "Payroll"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-white/60 font-helvetica text-right">{formatNaira(r.amountDue)}</td>
                      <td className="px-5 py-3 text-sm text-emerald-400 font-helvetica text-right">{formatNaira(r.amountDeducted)}</td>
                      <td className="px-5 py-3 text-sm font-helvetica text-right">
                        {r.shortfall > 0
                          ? <span className="text-amber-400">{formatNaira(r.shortfall)}</span>
                          : <span className="text-white/20">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-xs text-white/30 font-helvetica font-orbitron">
                        {r.payrollRunId ? r.payrollRunId.slice(-8).toUpperCase() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Rejected (show form again) ──
  if (loan !== "none" && loan.status === "rejected") {
    return (
      <div className="animate-fade-in max-w-2xl space-y-5">
        <div className="surface-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30 font-helvetica">Previous application rejected</span>
          </div>
          {loan.rejectionReason && (
            <p className="text-xs text-white/40 font-helvetica">{loan.rejectionReason}</p>
          )}
        </div>
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-lg font-bold text-white mb-1">Apply Again</h2>
          <p className="text-white/40 text-xs font-helvetica mb-6">Maximum amount: {formatNaira(MAX_LOAN)}</p>
          <form onSubmit={handleApply} className="space-y-5">
            <div>
              <label className="field-label">Loan Amount (₦)</label>
              <input
                type="number" min={1} max={MAX_LOAN} step={1000}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setApplyErr(null); }}
                placeholder={`Up to ${formatNaira(MAX_LOAN)}`}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">Repayment Period</label>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="input-field">
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m} className="bg-primary-dark">{m} months</option>
                ))}
              </select>
              {instalment > 0 && (
                <p className="mt-1.5 text-xs text-accent font-helvetica">
                  Your monthly deduction: <span className="font-orbitron font-bold">{formatNaira(instalment)}</span>
                </p>
              )}
            </div>
            <div>
              <label className="field-label">Reason for Loan</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setApplyErr(null); }}
                placeholder="Briefly describe why you need this loan…"
                className="input-field resize-none"
                required
              />
            </div>
            {applyErr && <p className="text-xs text-red-400 font-helvetica">{applyErr}</p>}
            <button type="submit" disabled={applying} className="btn-primary w-full py-3 disabled:opacity-50">
              {applying ? "Submitting…" : "Submit Application"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}

function ClockIcon() { return <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function CheckIcon() { return <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>; }
