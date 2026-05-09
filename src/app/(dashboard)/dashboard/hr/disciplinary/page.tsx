"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDiscEntries, resolveDiscEntry, addEmployeeResponse, updateDiscStatus } from "@/lib/disciplinary-service";
import { DISC_ACTION_LABELS, DISC_ACTION_STYLES, DISC_STATUS_STYLES } from "@/types/disciplinary";
import type { DiscEntry, DiscStatus } from "@/types/disciplinary";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DisciplinaryPage() {
  const { profile }             = useAuth();
  const [records, setRecords]   = useState<DiscEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [response, setResponse]   = useState("");
  const [acting, setActing]       = useState<string | null>(null);

  const canManage = profile
    ? isRootAdmin(profile.role) || hasPermission(profile.role, "manage:hr") || profile.role === "CEO"
    : false;

  useEffect(() => {
    if (!canManage) return;
    getDiscEntries().then(setRecords).finally(() => setLoading(false));
  }, [canManage]);

  if (!canManage) {
    return (
      <div className="animate-fade-in">
        <div className="surface-card px-6 py-16 text-center">
          <p className="text-white/20 text-sm font-helvetica">Access restricted to HR and CEO only.</p>
        </div>
      </div>
    );
  }

  async function handleResolve() {
    if (!resolveId || !profile || !resolution.trim()) return;
    setActing(resolveId);
    await resolveDiscEntry(resolveId, resolution, profile.displayName ?? profile.email ?? "HR");
    setRecords((prev) => prev.map((r) => r.id === resolveId ? { ...r, status: "resolved" as DiscStatus, resolution } : r));
    setActing(null); setResolveId(null); setResolution("");
  }

  async function handleResponse(id: string) {
    if (!response.trim()) return;
    setActing(id);
    await addEmployeeResponse(id, response);
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, employeeResponse: response } : r));
    setActing(null); setResponse("");
  }

  async function handleStatusChange(id: string, status: DiscStatus) {
    setActing(id);
    await updateDiscStatus(id, status);
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    setActing(null);
  }

  return (
    <div className="animate-fade-in">
      {/* Resolve modal */}
      {resolveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-4">Resolve Case</h3>
            <label className="field-label">Resolution Notes</label>
            <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} className="input-field resize-none mb-4" placeholder="Describe how this was resolved…" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setResolveId(null); setResolution(""); }} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleResolve} disabled={!resolution.trim()} className="btn-primary text-xs px-5">Mark Resolved</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Disciplinary &amp; Grievance</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Confidential employee records — HR &amp; CEO access only</p>
        </div>
        <Link href="/dashboard/hr/disciplinary/new" className="btn-primary text-xs px-4 py-2.5">+ New Record</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: records.length, color: "text-white" },
          { label: "Open", value: records.filter((r) => r.status === "open").length, color: "text-amber-400" },
          { label: "Resolved", value: records.filter((r) => r.status === "resolved").length, color: "text-emerald-400" },
          { label: "Escalated", value: records.filter((r) => r.status === "escalated").length, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden divide-y divide-white/5">
          {records.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No disciplinary records yet.</p>
            </div>
          ) : records.map((rec) => (
            <div key={rec.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap cursor-pointer" onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-white font-helvetica">{rec.employeeName}</p>
                    {rec.department && <span className="text-xs text-white/30 font-helvetica">{rec.department}</span>}
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", DISC_ACTION_STYLES[rec.action])}>
                      {DISC_ACTION_LABELS[rec.action]}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", DISC_STATUS_STYLES[rec.status])}>
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 font-helvetica">{rec.subject}</p>
                  <p className="text-xs text-white/30 font-helvetica mt-0.5">Issued by {rec.issuedBy} · {fmtDate(rec.issuedAt)}</p>
                </div>
                <span className="text-white/20 text-xs">{expanded === rec.id ? "▲" : "▼"}</span>
              </div>

              {expanded === rec.id && (
                <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                  <div>
                    <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Description</p>
                    <p className="text-sm text-white/70 font-helvetica">{rec.description}</p>
                  </div>
                  {rec.employeeResponse && (
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                      <p className="text-[10px] text-white/30 font-helvetica uppercase tracking-wider mb-1">Employee Response</p>
                      <p className="text-sm text-white/70 font-helvetica">{rec.employeeResponse}</p>
                      {rec.responseAt && <p className="text-[10px] text-white/20 font-helvetica mt-1">{fmtDate(rec.responseAt)}</p>}
                    </div>
                  )}
                  {rec.resolution && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                      <p className="text-[10px] text-emerald-400/60 font-helvetica uppercase tracking-wider mb-1">Resolution</p>
                      <p className="text-sm text-white/70 font-helvetica">{rec.resolution}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {rec.status === "open" && (
                      <>
                        <button onClick={() => setResolveId(rec.id)}
                          className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                          Mark Resolved
                        </button>
                        <button onClick={() => handleStatusChange(rec.id, "escalated")} disabled={acting === rec.id}
                          className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                          Escalate
                        </button>
                      </>
                    )}
                    {!rec.employeeResponse && rec.status === "open" && (
                      <div className="flex-1 flex gap-2 min-w-[200px]">
                        <input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Add employee response…" className="input-field flex-1 text-xs py-1.5" />
                        <button onClick={() => handleResponse(rec.id)} disabled={!response.trim() || acting === rec.id}
                          className="text-xs text-accent border border-accent/20 hover:bg-accent/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
