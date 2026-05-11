"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getEmployee, updateEmployee, addPerformanceNote, suspendEmployee, activateEmployee, deleteEmployee } from "@/lib/hr-service";
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
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
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

  const canManage  = profile ? hasPermission(profile.role, "manage:hr") : false;
  const isSelf     = profile?.uid === id;
  const canView    = canManage || isSelf;

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
        id:          Date.now().toString(),
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
              <h2 className="font-orbitron text-xl font-bold text-white">{employee.fullName}</h2>
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
            </div>

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
    </div>
  );
}

function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
