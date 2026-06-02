"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getEmployees, getPayrollRuns, createPayrollRun,
  markEntryPaid, markAllPaid,
} from "@/lib/hr-service";
import { MONTHS, PAYROLL_ENTRY_STYLES, payrollPeriod, formatHrDateTime } from "@/types/hr";
import type { Employee, PayrollRun, PayrollEntry } from "@/types/hr";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function PayrollPage() {
  const { profile } = useAuth();
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [runs, setRuns]             = useState<PayrollRun[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);

  const now   = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear]   = useState(now.getFullYear());

  const canManage = profile ? hasPermission(profile.role, "manage:hr") : false;
  const canView   = canManage || profile?.role === "CFO";

  const activeRun = useMemo(
    () => runs.find((r) => r.month === selMonth && r.year === selYear) ?? null,
    [runs, selMonth, selYear],
  );

  useEffect(() => {
    Promise.all([getEmployees(), getPayrollRuns()]).then(([emps, r]) => {
      setEmployees(emps);
      setRuns(r);
    }).finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!profile || !canManage) return;
    setGenerating(true);
    try {
      const active = employees.filter((e) => e.status === "active");
      const entries: PayrollEntry[] = active.map((e) => ({
        uid:        e.uid,
        name:       e.fullName,
        role:       e.role,
        department: e.department,
        baseSalary: e.salary,
        deductions: 0,
        netPay:     e.salary,
        status:     "pending",
      }));
      const run = await createPayrollRun({
        month:           selMonth,
        year:            selYear,
        status:          "draft",
        entries,
        totalGross:      entries.reduce((s, e) => s + e.baseSalary, 0),
        totalDeductions: 0,
        totalNet:        entries.reduce((s, e) => s + e.netPay, 0),
        generatedAt:     new Date().toISOString(),
        generatedBy:     profile.uid,
        generatedByName: profile.displayName ?? profile.email,
      });
      setRuns((prev) => [run, ...prev]);
    } finally { setGenerating(false); }
  }

  async function handleMarkPaid(uid: string) {
    if (!activeRun || !profile || !canManage) return;
    await markEntryPaid(activeRun.id, uid, activeRun.entries, profile.uid);
    const updated = activeRun.entries.map((e) =>
      e.uid === uid ? { ...e, status: "paid" as const, paidAt: new Date().toISOString() } : e
    );
    setRuns((prev) =>
      prev.map((r) => (r.id === activeRun.id ? { ...r, entries: updated } : r)),
    );
  }

  async function handleMarkAllPaid() {
    if (!activeRun || !profile || !canManage) return;
    await markAllPaid(activeRun.id, activeRun.entries, profile.uid);
    const updated = activeRun.entries.map((e) => ({ ...e, status: "paid" as const, paidAt: new Date().toISOString() }));
    setRuns((prev) =>
      prev.map((r) =>
        r.id === activeRun.id ? { ...r, entries: updated, status: "completed" } : r,
      ),
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!canView) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Access restricted.</p></div>;
  }

  const paidCount    = activeRun?.entries.filter((e) => e.status === "paid").length ?? 0;
  const pendingCount = activeRun?.entries.filter((e) => e.status === "pending").length ?? 0;

  return (
    <div className="animate-fade-in">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <label className="field-label mb-0">Month</label>
          <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))} className="input-field py-2 w-36">
            {MONTHS.map((m, i) => <option key={i} value={i + 1} className="bg-primary-dark">{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="field-label mb-0">Year</label>
          <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))} className="input-field py-2 w-28">
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y} className="bg-primary-dark">{y}</option>)}
          </select>
        </div>
        {canManage && !activeRun && (
          <button onClick={handleGenerate} disabled={generating} className="btn-primary text-xs px-5 py-2.5">
            {generating ? <><Spinner /> Generating…</> : `Generate ${MONTHS[selMonth - 1]} ${selYear} Payroll`}
          </button>
        )}
        {canManage && activeRun && pendingCount > 0 && (
          <button onClick={handleMarkAllPaid} className="flex items-center gap-2 px-4 py-2.5 text-xs text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/10 font-helvetica transition-colors">
            Mark All as Paid ({pendingCount})
          </button>
        )}
      </div>

      {!activeRun ? (
        <div className="surface-card px-6 py-16 text-center">
          <p className="text-white/20 text-sm font-helvetica">No payroll run for {payrollPeriod(selMonth, selYear)}.</p>
          {canManage && (
            <p className="text-white/30 text-xs font-helvetica mt-2">
              Click &quot;Generate Payroll&quot; to create it.
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-xl font-bold text-white">{activeRun.entries.length}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Employees</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(activeRun.totalNet)}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Total Payable</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-2xl font-bold text-emerald-400">{paidCount}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Paid</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-2xl font-bold text-amber-400">{pendingCount}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Pending</p>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
                {payrollPeriod(activeRun.month, activeRun.year)} Payroll
              </h2>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                activeRun.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"
              )}>
                {activeRun.status === "completed" ? "Completed" : "Draft"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Employee</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Role</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Base Salary</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Deductions</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Net Pay</th>
                    <th className="px-5 py-3 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                    {canManage && <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeRun.entries.map((entry) => (
                    <tr key={entry.uid} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-white font-helvetica">{entry.name}</p>
                        {entry.department && <p className="text-xs text-white/30 font-helvetica">{entry.department}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{entry.role}</td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica text-right">{formatNaira(entry.baseSalary)}</td>
                      <td className="px-5 py-3.5 text-sm text-red-400/70 font-helvetica text-right">
                        {entry.deductions > 0 ? `-${formatNaira(entry.deductions)}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-white font-helvetica text-right">{formatNaira(entry.netPay)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PAYROLL_ENTRY_STYLES[entry.status])}>
                          {entry.status === "paid" ? "Paid" : "Pending"}
                        </span>
                        {entry.paidAt && <p className="text-[9px] text-white/20 font-helvetica mt-0.5">{formatHrDateTime(entry.paidAt)}</p>}
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          {entry.status === "pending" && (
                            <button onClick={() => handleMarkPaid(entry.uid)}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-helvetica border border-emerald-500/20 hover:border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors">
                              Mark Paid
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Previous payroll runs */}
      {runs.length > 1 && (
        <div className="surface-card mt-6 p-5">
          <p className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Previous Runs</p>
          <div className="flex flex-wrap gap-2">
            {runs.filter((r) => r.id !== activeRun?.id).map((r) => (
              <button key={r.id} onClick={() => { setSelMonth(r.month); setSelYear(r.year); }}
                className="text-xs font-helvetica px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-colors">
                {payrollPeriod(r.month, r.year)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
