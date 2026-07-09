"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getEmployee, updateEmployee, updateEmployeeSalary, addPerformanceNote, suspendEmployee, activateEmployee, deleteEmployee, offboardEmployee } from "@/lib/hr-service";
import { getActiveLoanForEmployee } from "@/lib/loans-service";
import { getTickets } from "@/lib/tickets-service";
import { getProjects } from "@/lib/projects-service";
import {
  EMPLOYEE_STATUS_STYLES, PAYROLL_ENTRY_STYLES,
  formatHrDate, formatHrDateTime, PERFORMANCE_PERIODS,
} from "@/types/hr";
import type { Employee, PerformanceNote } from "@/types/hr";
import type { Ticket } from "@/types/tickets";
import { PRIORITY_STYLES, PRIORITY_LABELS, STATUS_STYLES, STATUS_LABELS } from "@/types/tickets";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { MONTHS } from "@/types/hr";
import type { PayslipSummary } from "@/types/hr";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { ROLE_COLORS } from "@/types/roles";
import type { Role } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function EmployeeProfilePage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [employee, setEmployee]   = useState<Employee | null>(null);
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading]     = useState(true);

  // Performance form
  const [perfPeriod, setPerfPeriod] = useState(PERFORMANCE_PERIODS[0]);
  const [perfRating, setPerfRating] = useState(4);
  const [perfNotes, setPerfNotes]   = useState("");
  const [savingPerf, setSavingPerf] = useState(false);

  // Edit notes
  const [notes, setNotes]         = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Status / delete actions
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Offboarding
  const [offboardTarget, setOffboardTarget] = useState<"resigned" | "terminated" | null>(null);
  const [offboardLoan, setOffboardLoan]     = useState<{ balance: number } | null>(null);
  const [offboardChecking, setOffboardChecking] = useState(false);
  const [offboardErr, setOffboardErr]       = useState<string | null>(null);

  // Edit salary
  const [showSalaryEdit, setShowSalaryEdit] = useState(false);
  const [salaryAmount, setSalaryAmount]     = useState("");
  const [salaryReason, setSalaryReason]     = useState("");
  const [savingSalary, setSavingSalary]     = useState(false);
  const [salaryError, setSalaryError]       = useState<string | null>(null);

  const [activeTab, setActiveTab]             = useState<"profile" | "payslip">("profile");
  const [payslips, setPayslips]               = useState<PayslipSummary[]>([]);
  const [payslipLoading, setPayslipLoading]   = useState(false);
  const [payslipError, setPayslipError]       = useState<string | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipSummary | null>(null);
  const [pdfDownloading, setPdfDownloading]   = useState(false);

  const canManage        = profile ? hasPermission(profile.role, "manage:hr") : false;
  const canRootAdmin     = profile ? isRootAdmin(profile.role) : false;
  const isSelf           = profile?.uid === id;
  const canView          = canManage || isSelf;
  // CEO and Executive Assistant both have view:all but neither has
  // manage:hr — they were removed from individual-payslip API access in
  // Stage 1 (canManageOthersPayslips is manage:hr only), so this no longer
  // includes view:all; showing them a tab that 403s on click is worse than
  // not showing it. Both get the aggregate payroll summary view instead.
  const canViewPayslipTab = profile
    ? hasPermission(profile.role, "manage:hr") || isSelf
    : false;

  useEffect(() => {
    if (!canView && !canManage) { router.replace("/dashboard"); return; }
    Promise.all([getEmployee(id), getTickets(), getProjects()]).then(([emp, tkts, projs]) => {
      setEmployee(emp);
      if (emp) setNotes(emp.notes ?? "");
      setTickets(tkts.filter((t) => t.assignedTo === id).slice(0, 5));
      const tasks = projs.flatMap((p) => p.tasks.filter((t) => t.assignedTo === id && t.status !== "done"));
      setTaskCount(tasks.length);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveNotes() {
    if (!employee) return;
    setSavingNotes(true);
    try { await updateEmployee(employee.uid, { notes }); } finally { setSavingNotes(false); }
  }

  async function handleAddPerf() {
    if (!employee || !profile || !perfNotes.trim()) return;
    setSavingPerf(true);
    try {
      const note: PerformanceNote = {
        id:          crypto.randomUUID(),
        period:      perfPeriod,
        rating:      perfRating,
        notes:       perfNotes.trim(),
        addedBy:     profile.uid,
        addedByName: profile.displayName ?? profile.email,
        createdAt:   new Date().toISOString(),
      };
      await addPerformanceNote(employee.uid, note);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "hr", entityId: employee.uid, entityRef: employee.fullName, details: `Performance note added for ${employee.fullName} — ${perfPeriod}`, timestamp: new Date().toISOString() });
      setEmployee((prev) => prev ? { ...prev, performanceNotes: [...(prev.performanceNotes ?? []), note] } : prev);
      setPerfNotes("");
    } finally { setSavingPerf(false); }
  }

  async function handleSaveSalary() {
    if (!employee || !profile) return;
    const newSalary = Number(salaryAmount);
    if (!salaryAmount || isNaN(newSalary) || newSalary < 0) {
      setSalaryError("Enter a valid amount.");
      return;
    }
    if (!salaryReason.trim()) {
      setSalaryError("A reason is required.");
      return;
    }
    setSalaryError(null);
    setSavingSalary(true);
    try {
      await updateEmployeeSalary(employee.uid, newSalary, salaryReason.trim(), profile.uid);
      setEmployee((prev) => prev ? { ...prev, salary: newSalary } : prev);
      setShowSalaryEdit(false);
      setSalaryAmount("");
      setSalaryReason("");
    } catch (err) {
      setSalaryError(err instanceof Error ? err.message : "Failed to update salary.");
    } finally {
      setSavingSalary(false);
    }
  }

  async function handleToggleSuspend() {
    if (!employee) return;
    setActionLoading(true);
    try {
      if (employee.status === "suspended") {
        await activateEmployee(employee.uid);
        if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "hr", entityId: employee.uid, entityRef: employee.fullName, details: `Employee ${employee.fullName} reactivated`, timestamp: new Date().toISOString() });
        setEmployee((prev) => prev ? { ...prev, status: "active" } : prev);
      } else {
        await suspendEmployee(employee.uid);
        if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "hr", entityId: employee.uid, entityRef: employee.fullName, details: `Employee ${employee.fullName} suspended`, timestamp: new Date().toISOString() });
        setEmployee((prev) => prev ? { ...prev, status: "suspended" } : prev);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!employee || !profile) return;
    setActionLoading(true);
    try {
      await deleteEmployee(employee.uid);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "delete", module: "hr", entityId: employee.uid, entityRef: employee.fullName, details: `Employee ${employee.fullName} deleted`, timestamp: new Date().toISOString() });
      router.replace("/dashboard/hr");
    } finally {
      setActionLoading(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleInitiateOffboard(status: "resigned" | "terminated") {
    if (!employee || !profile) return;
    setOffboardChecking(true);
    setOffboardErr(null);
    try {
      const loan = await getActiveLoanForEmployee(employee.uid);
      setOffboardLoan(loan && (loan.status === "active" || loan.status === "approved") ? { balance: loan.balance } : null);
      setOffboardTarget(status);
    } catch {
      setOffboardErr("Failed to check loan status. Please try again.");
    } finally {
      setOffboardChecking(false);
    }
  }

  async function handleConfirmOffboard() {
    if (!employee || !profile || !offboardTarget) return;
    setActionLoading(true);
    setOffboardErr(null);
    try {
      if (offboardLoan && !canRootAdmin) return;
      await offboardEmployee(employee.uid, offboardTarget);
      if (offboardLoan && canRootAdmin) {
        logAuditEvent({
          actorUid: profile.uid, actorName: profile.displayName ?? profile.email,
          actorRole: profile.role, action: "update", module: "hr",
          entityId: employee.uid, entityRef: employee.fullName,
          details: `Root Admin override — offboarding with outstanding loan balance of ${formatNaira(offboardLoan.balance)}`,
          timestamp: new Date().toISOString(),
        });
      }
      logAuditEvent({
        actorUid: profile.uid, actorName: profile.displayName ?? profile.email,
        actorRole: profile.role, action: "update", module: "hr",
        entityId: employee.uid, entityRef: employee.fullName,
        details: `Employee ${employee.fullName} marked as ${offboardTarget}`,
        timestamp: new Date().toISOString(),
      });
      setEmployee((prev) => prev ? { ...prev, status: offboardTarget } : prev);
      setOffboardTarget(null);
      setOffboardLoan(null);
    } catch (err) {
      setOffboardErr(err instanceof Error ? err.message : "Offboarding failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function loadPayslips() {
    if (!employee) return;
    setPayslipLoading(true);
    setPayslipError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/payslip?uid=${employee.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setPayslips(await res.json() as PayslipSummary[]);
    } catch {
      setPayslipError("Failed to load payslip data.");
    } finally {
      setPayslipLoading(false);
    }
  }

  async function handlePayslipDownload(s: PayslipSummary) {
    if (!employee) return;
    setPdfDownloading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(
        `/api/payslip/pdf?uid=${employee.uid}&year=${s.year}&month=${s.month}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `payslip-${MONTHS[s.month - 1]}-${s.year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF.");
    } finally {
      setPdfDownloading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!employee) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica mb-3">No employee record found for this user.</p>
        {canManage && (
          <button onClick={() => router.push("/dashboard/hr/new")} className="text-accent text-sm hover:underline font-helvetica">
            Create employee record →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-6xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back
      </button>

      {/* Header */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-2xl font-bold text-secondary font-orbitron">
              {employee.fullName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-orbitron text-xl font-bold text-white">{employee.fullName}</h2>
                {employee.employeeNumber && (
                  <span className="font-orbitron text-xs font-bold text-secondary border border-secondary/30 bg-secondary/10 px-2 py-0.5 rounded-md">
                    {employee.employeeNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", ROLE_COLORS[employee.role as Role] ?? "bg-white/8 text-white/40 border-white/15")}>
                  {employee.role}
                </span>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", EMPLOYEE_STATUS_STYLES[employee.status])}>
                  {employee.status}
                </span>
              </div>
              {employee.department && <p className="text-white/40 text-xs font-helvetica mt-1">{employee.department}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="font-orbitron text-2xl font-bold text-accent">{formatNaira(employee.salary)}</p>
              <p className="text-white/30 text-xs font-helvetica">per month</p>
              {canManage && !showSalaryEdit && (
                <button
                  onClick={() => { setShowSalaryEdit(true); setSalaryAmount(String(employee.salary)); setSalaryError(null); }}
                  className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors mt-1"
                >
                  Edit Salary
                </button>
              )}
            </div>

            {canManage && showSalaryEdit && (
              <div className="w-full max-w-xs p-4 bg-white/[0.03] border border-white/10 rounded-xl text-left animate-slide-up">
                <div className="mb-3">
                  <label className="field-label">New Amount (₦/month)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={salaryAmount}
                    onChange={(e) => setSalaryAmount(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="mb-3">
                  <label className="field-label">Reason (required)</label>
                  <textarea
                    rows={2}
                    value={salaryReason}
                    onChange={(e) => setSalaryReason(e.target.value)}
                    placeholder="e.g. Annual review, promotion to Senior Engineer"
                    className="input-field resize-none"
                  />
                </div>
                {salaryError && <p className="mb-3 text-xs text-red-400 font-helvetica">{salaryError}</p>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveSalary}
                    disabled={savingSalary}
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
                  >
                    {savingSalary ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setShowSalaryEdit(false); setSalaryError(null); }}
                    disabled={savingSalary}
                    className="text-xs text-white/40 hover:text-white font-helvetica transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Management actions ── */}
            {canManage && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Suspend / Activate */}
                <button
                  onClick={handleToggleSuspend}
                  disabled={actionLoading}
                  className={cn(
                    "text-xs font-helvetica font-semibold border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40",
                    employee.status === "suspended"
                      ? "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      : "text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  )}
                >
                  {actionLoading ? "…" : employee.status === "suspended" ? "✓ Activate" : "⏸ Suspend"}
                </button>

                {/* Offboard */}
                {(employee.status === "active" || employee.status === "suspended") && (
                  <>
                    <button
                      onClick={() => handleInitiateOffboard("resigned")}
                      disabled={actionLoading || offboardChecking}
                      className="text-xs text-purple-400 border border-purple-500/20 hover:bg-purple-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40"
                    >
                      {offboardChecking ? "…" : "Resign"}
                    </button>
                    <button
                      onClick={() => handleInitiateOffboard("terminated")}
                      disabled={actionLoading || offboardChecking}
                      className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40"
                    >
                      Terminate
                    </button>
                  </>
                )}
                {offboardErr && (
                  <p className="w-full text-xs text-red-400 font-helvetica">{offboardErr}</p>
                )}

                {/* Delete */}
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors"
                  >
                    🗑 Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-red-300 font-helvetica">Permanently delete?</span>
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-0.5 rounded font-helvetica disabled:opacity-40 transition-colors"
                    >
                      {actionLoading ? "…" : "Yes, Delete"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-xs text-white/40 hover:text-white font-helvetica transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation — managers + CEO */}
      {canViewPayslipTab && (
        <div className="flex mb-6 border-b border-white/10">
          {(["profile", "payslip"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActiveTab(t);
                if (t === "payslip" && payslips.length === 0 && !payslipLoading) loadPayslips();
              }}
              className={cn(
                "px-5 py-2.5 text-sm font-medium font-helvetica transition-all border-b-2 -mb-px capitalize",
                activeTab === t
                  ? "text-accent border-accent"
                  : "text-white/40 border-transparent hover:text-white hover:border-white/20"
              )}
            >
              {t === "profile" ? "Profile" : "Payslip"}
            </button>
          ))}
        </div>
      )}

      {activeTab === "profile" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Performance notes */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Performance History</h3>
            {(employee.performanceNotes ?? []).length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica mb-4">No performance notes yet.</p>
            ) : (
              <div className="space-y-3 mb-5">
                {[...(employee.performanceNotes ?? [])].reverse().map((n) => (
                  <div key={n.id} className="px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="font-orbitron text-xs text-accent">{n.period}</span>
                      <span className="text-amber-400 text-sm">{"★".repeat(n.rating)}{"☆".repeat(5 - n.rating)}</span>
                      <span className="text-[10px] text-white/30 font-helvetica ml-auto">{n.addedByName} · {formatHrDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white/60 font-helvetica">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}

            {canManage && (
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica">Add Performance Note</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Period</label>
                    <select value={perfPeriod} onChange={(e) => setPerfPeriod(e.target.value)} className="input-field">
                      {PERFORMANCE_PERIODS.map((p) => <option key={p} value={p} className="bg-primary-dark">{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Rating</label>
                    <div className="flex items-center gap-1 h-[46px]">
                      {[1,2,3,4,5].map((s) => (
                        <button key={s} type="button" onClick={() => setPerfRating(s)}
                          className={cn("text-xl transition-colors", s <= perfRating ? "text-amber-400" : "text-white/20 hover:text-white/40")}>
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <textarea value={perfNotes} onChange={(e) => setPerfNotes(e.target.value)} rows={3} placeholder="Performance observations, achievements, areas for improvement…" className="input-field resize-none" />
                <button onClick={handleAddPerf} disabled={savingPerf || !perfNotes.trim()} className="btn-primary text-xs px-4 py-2.5">
                  {savingPerf ? "Saving…" : "Add Note"}
                </button>
              </div>
            )}
          </div>

          {/* Assigned tickets */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Recent Tickets ({tickets.length})
            </h3>
            {tickets.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No tickets assigned.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/8 rounded-xl">
                    <span className="font-orbitron text-xs text-accent shrink-0">{t.ticketId}</span>
                    <span className="text-sm text-white/70 font-helvetica flex-1 line-clamp-1">{t.title}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PRIORITY_STYLES[t.priority])}>{PRIORITY_LABELS[t.priority]}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STATUS_STYLES[t.status])}>{STATUS_LABELS[t.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {canManage && (
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">HR Notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input-field resize-none mb-3" />
              <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary text-xs px-4 py-2.5">
                {savingNotes ? "Saving…" : "Save Notes"}
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Contact</p>
            <div className="space-y-1.5 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Email: </span>{employee.email || "—"}</p>
              <p className="text-white/60"><span className="text-white/30">Phone: </span>{employee.phone}</p>
              <p className="text-white/60"><span className="text-white/30">Joined: </span>{formatHrDate(employee.dateJoined)}</p>
            </div>
          </div>

          {canManage && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Bank Details</p>
              <div className="space-y-1.5 text-sm font-helvetica">
                <p className="text-white/60"><span className="text-white/30">Bank: </span>{employee.bankName}</p>
                <p className="text-white/60"><span className="text-white/30">Account: </span>{employee.accountNumber}</p>
                <p className="text-white/60"><span className="text-white/30">Name: </span>{employee.accountName}</p>
              </div>
            </div>
          )}

          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Next of Kin</p>
            <div className="space-y-1.5 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Name: </span>{employee.nextOfKin.name}</p>
              <p className="text-white/60"><span className="text-white/30">Rel: </span>{employee.nextOfKin.relationship}</p>
              <p className="text-white/60"><span className="text-white/30">Phone: </span>{employee.nextOfKin.phone}</p>
            </div>
          </div>

          <div className="surface-card p-5 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-orbitron text-xl font-bold text-amber-400">{taskCount}</p>
              <p className="text-white/30 text-[10px] font-helvetica">Open Tasks</p>
            </div>
            <div>
              <p className="font-orbitron text-xl font-bold text-secondary">{tickets.length}</p>
              <p className="text-white/30 text-[10px] font-helvetica">Tickets</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === "payslip" && canViewPayslipTab && (
        <div>
          {payslipLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {payslipError && (
            <p className="text-red-400 text-sm font-helvetica py-8 text-center">{payslipError}</p>
          )}
          {!payslipLoading && !payslipError && (
            <div className="surface-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Period", "Gross", "PAYE", "Net Pay", "Status", ""].map((h) => (
                      <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica first:pl-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(() => {
                    const months: Array<{ month: number; year: number }> = [];
                    let m = 5, y = 2026;
                    const now = new Date();
                    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
                      months.push({ month: m, year: y });
                      m++; if (m > 12) { m = 1; y++; }
                    }
                    return months.reverse().map(({ month, year }) => {
                      const s = payslips.find((x) => x.month === month && x.year === year) ?? null;
                      return (
                        <tr key={`${year}-${month}`} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 font-helvetica text-sm text-white font-semibold">{MONTHS[month - 1]} {year}</td>
                          <td className="px-5 py-4 text-sm font-helvetica text-white/70">
                            {s ? formatNaira(s.baseSalary) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-5 py-4 text-sm font-helvetica text-red-400/80">
                            {s ? `−${formatNaira(s.payeAmount)}` : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-5 py-4 text-sm font-helvetica font-semibold text-white">
                            {s ? formatNaira(s.netPay) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-5 py-4">
                            {s ? (
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                                s.status === "paid"
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              )}>
                                {s.status === "paid" ? "Paid" : "Pending"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/20 font-helvetica">Not generated</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {s && (
                              <button
                                onClick={() => setSelectedPayslip(s)}
                                className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors"
                              >
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {selectedPayslip && employee && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setSelectedPayslip(null)}>
              <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-lg p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-orbitron text-base font-bold text-white">
                    {MONTHS[selectedPayslip.month - 1]} {selectedPayslip.year} — {employee.fullName}
                  </h2>
                  <button onClick={() => setSelectedPayslip(null)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
                </div>
                <div className="space-y-0 text-sm font-helvetica mb-4">
                  <div className="flex justify-between py-2.5 border-b border-white/5">
                    <span className="text-white/50">Gross Salary</span>
                    <span className="text-white">{formatNaira(selectedPayslip.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 border-b border-white/5">
                    <span className="text-white/50">PAYE</span>
                    <span className="text-red-400">−{formatNaira(selectedPayslip.payeAmount)}</span>
                  </div>
                  {selectedPayslip.deductions > 0 && (
                    <div className="flex justify-between py-2.5 border-b border-white/5">
                      <span className="text-white/50">Other Deductions</span>
                      <span className="text-red-400">−{formatNaira(selectedPayslip.deductions)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3">
                    <span className="font-orbitron text-sm font-bold text-white">NET PAY</span>
                    <span className="font-orbitron text-xl font-bold text-accent">{formatNaira(selectedPayslip.netPay)}</span>
                  </div>
                </div>
                <p className="text-xs font-helvetica text-white/30 mb-4">
                  Ref: <span className="text-accent font-orbitron">{selectedPayslip.referenceNumber}</span>
                </p>
                <button
                  onClick={() => handlePayslipDownload(selectedPayslip)}
                  disabled={pdfDownloading}
                  className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
                >
                  {pdfDownloading ? "Generating PDF…" : "↓ Download as PDF"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offboarding modal */}
      {offboardTarget && employee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-md p-6 animate-slide-up">
            {offboardLoan ? (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <WarnIcon />
                  <div>
                    <h2 className="font-orbitron text-base font-bold text-white mb-1">Warning: Outstanding Loan Balance</h2>
                    <p className="text-sm text-white/60 font-helvetica">
                      <span className="text-white font-semibold">{employee.fullName}</span> has an outstanding loan balance of{" "}
                      <span className="text-amber-400 font-semibold font-orbitron">{formatNaira(offboardLoan.balance)}</span>.
                      Company policy requires full repayment before offboarding. A Root Admin override is required to proceed.
                    </p>
                  </div>
                </div>
                {offboardErr && <p className="mb-4 text-xs text-red-400 font-helvetica">{offboardErr}</p>}
                <div className="flex gap-3">
                  {canRootAdmin ? (
                    <button
                      onClick={handleConfirmOffboard}
                      disabled={actionLoading}
                      className="flex-1 text-sm text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
                    >
                      {actionLoading ? "Processing…" : "Override and Proceed"}
                    </button>
                  ) : (
                    <div className="flex-1 text-sm text-white/40 font-helvetica py-2.5 text-center border border-white/10 rounded-xl">
                      Contact Root Admin to proceed
                    </div>
                  )}
                  <button
                    onClick={() => { setOffboardTarget(null); setOffboardLoan(null); setOffboardErr(null); }}
                    className="text-sm text-white/40 hover:text-white font-helvetica px-3"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-orbitron text-base font-bold text-white mb-2">
                  Confirm {offboardTarget === "resigned" ? "Resignation" : "Termination"}
                </h2>
                <p className="text-sm text-white/60 font-helvetica mb-6">
                  Mark <span className="text-white font-semibold">{employee.fullName}</span> as{" "}
                  <span className="capitalize font-semibold text-white">{offboardTarget}</span>?
                  This will update their employment status.
                </p>
                {offboardErr && <p className="mb-4 text-xs text-red-400 font-helvetica">{offboardErr}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmOffboard}
                    disabled={actionLoading}
                    className="flex-1 text-sm text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl font-helvetica font-semibold transition-colors disabled:opacity-40"
                  >
                    {actionLoading ? "Processing…" : `Yes, Mark as ${offboardTarget === "resigned" ? "Resigned" : "Terminated"}`}
                  </button>
                  <button
                    onClick={() => { setOffboardTarget(null); setOffboardLoan(null); setOffboardErr(null); }}
                    className="text-sm text-white/40 hover:text-white font-helvetica px-3"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function WarnIcon()  { return <svg className="w-6 h-6 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
