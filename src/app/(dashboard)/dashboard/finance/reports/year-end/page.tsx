"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { formatNaira } from "@/types/finance";
import { runYearEndClose, getYearEndSummary } from "@/lib/accounting/year-end";
import type { YearEndSummary } from "@/lib/accounting/year-end";
import { cn } from "@/lib/utils";

function buildYears(): number[] {
  const y = new Date().getFullYear();
  return [y - 1, y - 2, y - 3];
}

export default function YearEndClosePage() {
  const { profile } = useAuth();
  const canManage   = profile ? hasPermission(profile.role, "manage:finance") : false;

  const [year, setYear]           = useState(new Date().getFullYear() - 1);
  const [summary, setSummary]     = useState<YearEndSummary | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning]     = useState(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSuccessRef(null);
    setError(null);
    setSummary(null);
    getYearEndSummary(year).then(setSummary).finally(() => setLoading(false));
  }, [year]);

  async function handleClose() {
    if (!profile || !canManage) return;
    setRunning(true);
    setError(null);
    try {
      const entry = await runYearEndClose(year, profile.uid);
      setSuccessRef(entry.entryNumber);
      setShowConfirm(false);
      setSummary((prev) => prev ? { ...prev, alreadyClosed: true, closingRef: `YEC-${year}` } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Year-end close failed");
      setShowConfirm(false);
    } finally {
      setRunning(false);
    }
  }

  if (!canManage) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">You do not have permission to run year-end close.</p>
      </div>
    );
  }

  const years = buildYears();
  const isBlank = summary && summary.totalRevenue === 0 && summary.totalExpenses === 0;

  return (
    <div className="animate-fade-in max-w-2xl space-y-5">

      {/* Year selector */}
      <div className="surface-card p-6">
        <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Financial Year</h3>
        <div className="flex gap-2 flex-wrap">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "px-4 py-2 text-sm rounded-xl border font-helvetica transition-colors",
                year === y
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              FY {y}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-white/20 font-helvetica">
          Year-end close is always run for a completed financial year, not the current year.
        </p>
      </div>

      {/* Summary */}
      <div className="surface-card p-6">
        <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
          FY {year} — Journal Entry Summary
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-white/[0.03] rounded-xl">
                <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-2">Total Revenue</p>
                <p className="font-orbitron text-base font-bold text-emerald-400 tabular-nums">{formatNaira(summary.totalRevenue)}</p>
              </div>
              <div className="p-4 bg-white/[0.03] rounded-xl">
                <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-2">Total Expenses</p>
                <p className="font-orbitron text-base font-bold text-red-400 tabular-nums">{formatNaira(summary.totalExpenses)}</p>
              </div>
              <div className="p-4 bg-white/[0.03] rounded-xl">
                <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-2">
                  Net {summary.netProfit >= 0 ? "Profit" : "Loss"}
                </p>
                <p className={cn("font-orbitron text-base font-bold tabular-nums", summary.netProfit >= 0 ? "text-secondary" : "text-red-400")}>
                  {formatNaira(Math.abs(summary.netProfit))}
                </p>
              </div>
            </div>

            {summary.alreadyClosed ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                <span className="text-emerald-400 shrink-0">✓</span>
                <p className="text-emerald-400 text-sm font-helvetica">
                  Year-end close for {year} already posted — ref{" "}
                  <span className="font-orbitron font-bold">{summary.closingRef ?? `YEC-${year}`}</span>
                </p>
              </div>
            ) : isBlank ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-white/30 shrink-0">—</span>
                <p className="text-white/40 text-sm font-helvetica">
                  No posted journal entries found for FY {year}. Ensure transactions have been recorded and reconciled before running year-end close.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                  <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
                  <p className="text-amber-300/80 text-xs font-helvetica leading-relaxed">
                    This will post a closing journal entry transferring{" "}
                    <span className="text-amber-300 font-semibold">{formatNaira(Math.abs(summary.netProfit))}</span>{" "}
                    ({summary.netProfit >= 0 ? "profit" : "loss"}) to Retained Earnings for FY {year}.
                    Ensure all transactions for the year have been recorded and reconciled before proceeding.
                  </p>
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="btn-primary w-full"
                >
                  Run Year-End Close for FY {year}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Success banner */}
      {successRef && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl animate-fade-in">
          <p className="text-emerald-400 text-sm font-helvetica">
            Year-end close posted — journal entry{" "}
            <span className="font-orbitron font-bold">{successRef}</span>{" "}
            (ref: YEC-{year})
          </p>
          <button onClick={() => setSuccessRef(null)} className="text-xs text-emerald-400/60 hover:text-emerald-400 font-helvetica">✕</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-red-300/80 text-sm font-helvetica flex-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 hover:text-red-300 font-helvetica border border-red-500/20 hover:border-red-400/40 px-2 py-0.5 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Explanation */}
      <div className="surface-card p-5">
        <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">How It Works</p>
        <div className="space-y-2 text-xs text-white/40 font-helvetica leading-relaxed">
          <p>
            The year-end close debits all revenue accounts (4xxx) and credits all expense accounts (5xxx/6xxx),
            posting the net difference to{" "}
            <span className="text-white/60">3100 Retained Earnings</span>.
            This zeroes out the P&amp;L and resets the income accounts for the new financial year.
          </p>
          <p>A profit increases Retained Earnings (credit). A loss reduces it (debit).</p>
          <p>
            Figures are derived directly from posted journal entries. Run Reconcile Ledger first if
            you suspect any missing entries.
          </p>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="surface-card p-6 max-w-sm w-full space-y-4 animate-fade-in">
            <h3 className="font-orbitron text-sm font-bold text-white">Confirm Year-End Close</h3>
            <p className="text-white/60 text-sm font-helvetica leading-relaxed">
              This will post a closing journal entry for FY {year} transferring{" "}
              <span className="text-white font-semibold">{formatNaira(Math.abs(summary.netProfit))}</span>{" "}
              ({summary.netProfit >= 0 ? "net profit" : "net loss"}) to Retained Earnings.{" "}
              <span className="text-amber-400">This cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={running}
                className="btn-primary flex-1 text-sm"
              >
                {running ? "Posting…" : "Confirm & Post"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-white/40 hover:text-white font-helvetica transition-colors border border-white/10 hover:border-white/20 rounded-xl"
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
