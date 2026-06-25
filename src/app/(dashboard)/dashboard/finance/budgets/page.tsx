"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canSetBudget } from "@/types/roles";
import { setBudget, getBudgetsForYear } from "@/lib/budget-service";
import { getExpenseActualsForYear } from "@/lib/expense-service";
import type { ExpenseBudget } from "@/types/budget";
import type { CategoryMonthActuals } from "@/lib/expense-service";
import { EXPENSE_CATEGORY_LABELS } from "@/types/expense";
import type { ExpenseCategory } from "@/types/expense";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

function buildYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
}

interface CategoryRow {
  category:           ExpenseCategory;
  annualBudget:        number | null; // null = no budget set yet
  monthlyPaceTarget:   number;
  thisMonthActual:     number;
  ytdActual:           number;
  ytdProRatedBudget:   number;
  staffClaimYtd:       number;
  companyExpenseYtd:   number;
}

export default function BudgetsPage() {
  const { profile } = useAuth();
  const realNow      = new Date();
  const realYear     = realNow.getFullYear();
  const realMonth    = realNow.getMonth() + 1; // 1-12

  const [year, setYear]         = useState(realYear);
  const [budgets, setBudgets]   = useState<ExpenseBudget[]>([]);
  const [actuals, setActuals]   = useState<CategoryMonthActuals[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editAmount, setEditAmount]           = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEdit = profile ? canSetBudget(profile.role) : false;

  // Months "elapsed" for pro-ration: the real current month if viewing
  // the real current year; the full year if viewing a past year; zero if
  // viewing a future year that hasn't started yet. Avoids implying any
  // figure for time that either hasn't happened or is long over.
  const monthsElapsed = year === realYear ? realMonth : year < realYear ? 12 : 0;
  const isCurrentYear  = year === realYear;

  async function load(y: number) {
    setLoading(true);
    setError(null);
    try {
      const [b, a] = await Promise.all([getBudgetsForYear(y), getExpenseActualsForYear(y)]);
      setBudgets(b);
      setActuals(a);
    } catch {
      setError("Failed to load budget data. Check your connection and try again.");
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(year); }, [year]);

  const rows: CategoryRow[] = CATEGORIES.map((category) => {
    const budgetDoc   = budgets.find((b) => b.category === category);
    const annualBudget = budgetDoc?.annualBudgetAmount ?? null;
    const monthlyPaceTarget = annualBudget != null ? annualBudget / 12 : 0;

    const categoryActuals = actuals.filter((a) => a.category === category);
    const thisMonthActual = categoryActuals.find((a) => a.month === realMonth)?.total ?? 0;
    const ytdRows = categoryActuals.filter((a) => a.month <= monthsElapsed);
    const ytdActual         = ytdRows.reduce((s, a) => s + a.total, 0);
    const staffClaimYtd     = ytdRows.reduce((s, a) => s + a.staffClaim, 0);
    const companyExpenseYtd = ytdRows.reduce((s, a) => s + a.companyExpense, 0);
    const ytdProRatedBudget = annualBudget != null ? annualBudget * (monthsElapsed / 12) : 0;

    return { category, annualBudget, monthlyPaceTarget, thisMonthActual, ytdActual, ytdProRatedBudget, staffClaimYtd, companyExpenseYtd };
  });

  function startEdit(category: ExpenseCategory, current: number | null) {
    setEditingCategory(category);
    setEditAmount(current != null ? String(current) : "");
    setSaveError(null);
  }

  async function handleSave(category: ExpenseCategory) {
    if (!profile || !editAmount) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await setBudget(category, year, Number(editAmount), profile.uid);
      setBudgets((prev) => {
        const without = prev.filter((b) => b.category !== category);
        return [...without, updated];
      });
      setEditingCategory(null);
      setEditAmount("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save budget");
    } finally { setSaving(false); }
  }

  function varianceStatus(ytdActual: number, ytdProRatedBudget: number, annualBudget: number | null): { label: string; style: string } {
    if (annualBudget == null) return { label: "No budget set", style: "text-white/30 border-white/10" };
    if (ytdProRatedBudget === 0) return { label: "No time elapsed", style: "text-white/30 border-white/10" };
    const ratio = ytdActual / ytdProRatedBudget;
    if (ratio > 1.05) return { label: "Over Budget", style: "bg-red-500/15 text-red-400 border-red-500/30" };
    if (ratio < 0.95) return { label: "Under Budget", style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    return { label: "On Track", style: "bg-secondary/15 text-secondary border-secondary/30" };
  }

  return (
    <div className="animate-fade-in space-y-5">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-red-300/80 text-sm font-helvetica flex-1">{error}</p>
          <button onClick={() => load(year)} className="text-xs text-red-400 hover:text-red-300 font-helvetica border border-red-500/20 hover:border-red-400/40 px-3 py-1 rounded-lg transition-colors shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-orbitron text-sm font-bold text-white">Budget vs. Actual</h2>
          <p className="text-white/40 text-xs font-helvetica mt-0.5">
            One annual budget per category — staff claims and company expenses are shown split within each category&apos;s actual spend.
          </p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-32">
          {buildYearOptions().map((y) => <option key={y} value={y} className="bg-primary-dark">{y}</option>)}
        </select>
      </div>

      {!canEdit && (
        <p className="text-[10px] text-white/25 font-helvetica">
          You can view budgets but do not have permission to set them.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((row) => {
            const variance = varianceStatus(row.ytdActual, row.ytdProRatedBudget, row.annualBudget);
            const isEditing = editingCategory === row.category;

            return (
              <div key={row.category} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-orbitron text-xs font-semibold text-white uppercase tracking-wide">
                    {EXPENSE_CATEGORY_LABELS[row.category]}
                  </h3>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica shrink-0", variance.style)}>
                    {variance.label}
                  </span>
                </div>

                {/* Annual budget — editable or read-only */}
                <div className="mb-3 pb-3 border-b border-white/10">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-helvetica mb-1">Annual Budget</p>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" step="0.01" value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="input-field flex-1" autoFocus
                      />
                      <button onClick={() => handleSave(row.category)} disabled={saving || !editAmount} className="btn-primary text-xs px-3 py-2 disabled:opacity-50">
                        {saving ? "…" : "Save"}
                      </button>
                      <button onClick={() => setEditingCategory(null)} className="text-xs text-white/40 hover:text-white font-helvetica px-2">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="font-orbitron text-lg font-bold text-white">
                        {row.annualBudget != null ? formatNaira(row.annualBudget) : "₦0 — no budget set"}
                      </p>
                      {canEdit && (
                        <button onClick={() => startEdit(row.category, row.annualBudget)} className="text-[10px] text-accent hover:underline font-helvetica">
                          {row.annualBudget != null ? "Edit" : "Set budget"}
                        </button>
                      )}
                    </div>
                  )}
                  {isEditing && saveError && <p className="text-[10px] text-red-400 font-helvetica mt-1.5">{saveError}</p>}
                </div>

                {/* Pace + actuals */}
                <div className="grid grid-cols-2 gap-3 mb-3 text-xs font-helvetica">
                  <div>
                    <p className="text-white/30 mb-0.5">Monthly Pace Target</p>
                    <p className="text-white/70">{formatNaira(row.monthlyPaceTarget)}</p>
                  </div>
                  {isCurrentYear && (
                    <div>
                      <p className="text-white/30 mb-0.5">Spent This Month</p>
                      <p className="text-white/70">{formatNaira(row.thisMonthActual)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-white/30 mb-0.5">YTD Actual</p>
                    <p className="text-white/70">{formatNaira(row.ytdActual)}</p>
                  </div>
                  <div>
                    <p className="text-white/30 mb-0.5">YTD Pro-Rated Budget</p>
                    <p className="text-white/70">{formatNaira(row.ytdProRatedBudget)}</p>
                  </div>
                </div>

                {/* staff_claim vs company_expense split */}
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-helvetica mb-1">YTD Spend Split</p>
                  {row.ytdActual === 0 ? (
                    <p className="text-xs text-white/40 font-helvetica">₦0 spent — no expenses recorded for this category yet.</p>
                  ) : (
                    <p className="text-xs text-white/60 font-helvetica">
                      {formatNaira(row.ytdActual)} total ({formatNaira(row.companyExpenseYtd)} company, {formatNaira(row.staffClaimYtd)} staff claims)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
