"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getEmployees, suspendEmployee, activateEmployee, deleteEmployee,
} from "@/lib/hr-service";
import { EMPLOYEE_STATUS_STYLES, formatHrDate } from "@/types/hr";
import type { Employee } from "@/types/hr";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { formatNaira } from "@/types/finance";
import { ROLE_COLORS } from "@/types/roles";
import type { Role } from "@/types/roles";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";

export default function EmployeeListPage() {
  const { profile } = useAuth();
  const router      = useRouter();

  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // uid pending deletion
  const [actionLoading, setActionLoading] = useState<string | null>(null); // uid currently processing
  const [actionError, setActionError]     = useState<string | null>(null);
  const [migrating, setMigrating]         = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  const canManage  = profile ? hasPermission(profile.role, "manage:hr") : false;
  const canMigrate = profile ? isRootAdmin(profile.role) : false;

  useEffect(() => {
    if (!canManage && profile) {
      router.replace(`/dashboard/hr/${profile.uid}`);
      return;
    }
    getEmployees().then(setEmployees).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, profile?.uid]);

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      (e.employeeNumber ?? "").toLowerCase().includes(q)
    );
  });

  const active       = employees.filter((e) => e.status === "active").length;
  const suspended    = employees.filter((e) => e.status === "suspended").length;
  const totalPayroll = employees.filter((e) => e.status === "active").reduce((s, e) => s + e.salary, 0);

  /* ── Actions ── */
  async function handleToggleSuspend(emp: Employee) {
    setActionLoading(emp.uid);
    try {
      if (emp.status === "suspended") {
        await activateEmployee(emp.uid);
        if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "hr", entityId: emp.uid, entityRef: emp.fullName, details: `Employee ${emp.fullName} reactivated`, timestamp: new Date().toISOString() });
        setEmployees((prev) => prev.map((e) => e.uid === emp.uid ? { ...e, status: "active" } : e));
      } else {
        await suspendEmployee(emp.uid);
        if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "hr", entityId: emp.uid, entityRef: emp.fullName, details: `Employee ${emp.fullName} suspended`, timestamp: new Date().toISOString() });
        setEmployees((prev) => prev.map((e) => e.uid === emp.uid ? { ...e, status: "suspended" } : e));
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(uid: string) {
    setActionError(null);
    setActionLoading(uid);
    try {
      const emp = employees.find((e) => e.uid === uid);
      await deleteEmployee(uid);
      if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "delete", module: "hr", entityId: uid, entityRef: emp?.fullName, details: `Employee ${emp?.fullName ?? uid} deleted`, timestamp: new Date().toISOString() });
      setEmployees((prev) => prev.filter((e) => e.uid !== uid));
      setConfirmDelete(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete user.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMigrate() {
    if (!canMigrate) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res   = await fetch("/api/admin/migrate-employee-numbers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { message?: string; assigned?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Migration failed");
      setMigrateResult(json.message ?? `Done — ${json.assigned} assigned`);
      // Refresh the list so the new numbers appear
      getEmployees().then(setEmployees);
    } catch (err) {
      setMigrateResult(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-white">{employees.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-emerald-400">{active}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Active</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className={cn("font-orbitron text-2xl font-bold", suspended > 0 ? "text-amber-400" : "text-white/30")}>{suspended}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Suspended</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(totalPayroll)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Monthly Payroll</p>
        </div>
      </div>

      {/* Toolbar */}
      {actionError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 font-helvetica">
          {actionError}
        </div>
      )}
      {migrateResult && (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent font-helvetica flex items-center justify-between gap-3">
          <span>{migrateResult}</span>
          <button onClick={() => setMigrateResult(null)} className="text-white/30 hover:text-white transition-colors">✕</button>
        </div>
      )}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, department or role…"
            className="input-field pl-10"
          />
        </div>
        {canMigrate && employees.some((e) => !e.employeeNumber) && (
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="text-xs font-helvetica font-semibold border border-secondary/30 text-secondary hover:bg-secondary/10 px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
            title="Assign CTL numbers to all existing employees"
          >
            {migrating ? "Assigning…" : "Assign Emp #s"}
          </button>
        )}
        {canManage && (
          <Link href="/dashboard/hr/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> Add Employee
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {employees.length === 0 ? "No employee records yet." : "No employees match search."}
            </p>
            {canManage && employees.length === 0 && (
              <Link href="/dashboard/hr/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Add first employee →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Emp #</th>
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Employee</th>
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Role</th>
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Department</th>
                  <th className="px-5 py-4 text-right  text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Salary/mo</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-left   text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Joined</th>
                  {canManage && (
                    <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((emp) => {
                  const isBusy    = actionLoading === emp.uid;
                  const isDel     = confirmDelete === emp.uid;
                  const isSusp    = emp.status === "suspended";

                  return (
                    <tr
                      key={emp.id}
                      className={cn(
                        "transition-colors",
                        isSusp ? "bg-amber-500/[0.03]" : "hover:bg-white/[0.02]",
                        isDel  && "bg-red-500/[0.05]"
                      )}
                    >
                      {/* Emp # */}
                      <td className="px-5 py-3.5">
                        {emp.employeeNumber
                          ? <span className="font-orbitron text-xs font-bold text-secondary">{emp.employeeNumber}</span>
                          : <span className="text-xs text-white/20 font-helvetica">—</span>
                        }
                      </td>

                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/hr/${emp.uid}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                          {emp.fullName}
                        </Link>
                        <p className="text-xs text-white/30 font-helvetica">{emp.email}</p>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                          ROLE_COLORS[emp.role as Role] ?? "bg-white/8 text-white/40 border-white/15"
                        )}>
                          {emp.role}
                        </span>
                      </td>

                      {/* Dept */}
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{emp.department || "—"}</td>

                      {/* Salary */}
                      <td className="px-5 py-3.5 text-sm text-white font-semibold font-helvetica text-right">
                        {formatNaira(emp.salary)}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize",
                          EMPLOYEE_STATUS_STYLES[emp.status]
                        )}>
                          {emp.status}
                        </span>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">
                        {formatHrDate(emp.dateJoined)}
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="px-5 py-3.5">
                          {isDel ? (
                            /* ── Delete confirmation ── */
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-red-400 font-helvetica">Delete?</span>
                              <button
                                onClick={() => handleDelete(emp.uid)}
                                disabled={isBusy}
                                className="text-xs text-red-400 border border-red-500/30 hover:bg-red-500/15 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40"
                              >
                                {isBusy ? "…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-xs text-white/30 hover:text-white font-helvetica transition-colors px-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            /* ── Normal actions ── */
                            <div className="flex items-center gap-1.5 justify-end">
                              <Link
                                href={`/dashboard/hr/${emp.uid}`}
                                className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                View
                              </Link>
                              <button
                                onClick={() => handleToggleSuspend(emp)}
                                disabled={isBusy}
                                className={cn(
                                  "text-xs font-helvetica border px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40",
                                  isSusp
                                    ? "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                                    : "text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                                )}
                              >
                                {isBusy ? "…" : isSusp ? "Activate" : "Suspend"}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(emp.uid)}
                                className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function PlusIcon()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
