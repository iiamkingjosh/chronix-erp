"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaveRequests, getMyLeaveRequests, reviewLeave, cancelLeave } from "@/lib/leave-service";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_STYLES } from "@/types/leave";
import type { LeaveRequest } from "@/types/leave";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function LeavePage() {
  const { profile }             = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing]     = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const canManage = profile ? hasPermission(profile.role, "manage:hr") : false;

  useEffect(() => {
    if (!profile) return;
    const load = canManage ? getLeaveRequests() : getMyLeaveRequests(profile.uid);
    load.then(setRequests).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, canManage]);

  const filtered = filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);
  const pending = requests.filter((r) => r.status === "pending").length;

  async function handleApprove(id: string) {
    if (!profile) return;
    setActing(id);
    await reviewLeave(id, "approved", profile.displayName ?? profile.email ?? "HR");
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "approved" as const } : r));
    setActing(null);
  }

  async function handleReject() {
    if (!rejectId || !profile) return;
    setActing(rejectId);
    await reviewLeave(rejectId, "rejected", profile.displayName ?? profile.email ?? "HR", rejectReason);
    setRequests((prev) => prev.map((r) => r.id === rejectId ? { ...r, status: "rejected" as const } : r));
    setActing(null); setRejectId(null); setRejectReason("");
  }

  async function handleCancel(id: string) {
    setActing(id);
    await cancelLeave(id);
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "cancelled" as const } : r));
    setActing(null);
  }

  return (
    <div className="animate-fade-in">
      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-4">Reject Leave Request</h3>
            <label className="field-label">Reason</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="input-field resize-none mb-4" placeholder="Reason for rejection…" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleReject} className="btn-primary text-xs px-5">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Leave Management</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            {canManage ? `${pending} request${pending !== 1 ? "s" : ""} awaiting review` : "Your leave requests"}
          </p>
        </div>
        <Link href="/dashboard/hr/leave/new" className="btn-primary text-xs px-4 py-2.5">+ Apply for Leave</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: requests.length, color: "text-white" },
          { label: "Pending", value: requests.filter((r) => r.status === "pending").length, color: "text-amber-400" },
          { label: "Approved", value: requests.filter((r) => r.status === "approved").length, color: "text-emerald-400" },
          { label: "Rejected", value: requests.filter((r) => r.status === "rejected").length, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {["all", "pending", "approved", "rejected", "cancelled"].map((f) => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
              filterStatus === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No leave requests found.</p>
              <Link href="/dashboard/hr/leave/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">Apply for leave →</Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((req) => (
                <div key={req.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-white font-helvetica">{req.employeeName}</p>
                        <span className="text-xs text-white/30 font-helvetica">{req.department}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", LEAVE_STATUS_STYLES[req.status])}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-accent font-helvetica font-semibold">{LEAVE_TYPE_LABELS[req.leaveType]}</p>
                      <p className="text-xs text-white/50 font-helvetica mt-0.5">
                        {fmtDate(req.startDate)} → {fmtDate(req.endDate)} &nbsp;·&nbsp; <strong className="text-white/70">{req.days} day{req.days !== 1 ? "s" : ""}</strong>
                      </p>
                      <p className="text-xs text-white/40 font-helvetica mt-1">{req.reason}</p>
                      {req.status === "rejected" && req.rejectionReason && (
                        <p className="text-xs text-red-300/70 font-helvetica mt-1">Rejected: {req.rejectionReason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canManage && req.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(req.id)} disabled={acting === req.id}
                            className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                            {acting === req.id ? "…" : "Approve"}
                          </button>
                          <button onClick={() => setRejectId(req.id)}
                            className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                            Reject
                          </button>
                        </>
                      )}
                      {!canManage && req.status === "pending" && req.employeeUid === profile?.uid && (
                        <button onClick={() => handleCancel(req.id)} disabled={acting === req.id}
                          className="text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
