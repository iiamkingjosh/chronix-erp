"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getChanges, updateChangeStatus } from "@/lib/change-service";
import { CHANGE_RISK_STYLES, CHANGE_STATUS_STYLES, CHANGE_TYPE_LABELS } from "@/types/change";
import type { ChangeEntry, ChangeStatus } from "@/types/change";
import { useAuth } from "@/contexts/AuthContext";
import { isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ChangesPage() {
  const { profile }               = useAuth();
  const [changes, setChanges]     = useState<ChangeEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [acting, setActing]       = useState<string | null>(null);
  const [postNotes, setPostNotes] = useState("");
  const [postId, setPostId]       = useState<string | null>(null);

  const canApprove = !!profile && (
    isRootAdmin(profile.role) ||
    profile.role === "System Admin" ||
    profile.role === "CEO" ||
    profile.role === "CFO"
  );

  useEffect(() => { getChanges().then(setChanges).finally(() => setLoading(false)); }, []);

  const filtered = filter === "all" ? changes : changes.filter((c) => c.status === filter);

  async function handleStatus(id: string, status: ChangeStatus, extra?: { postImplementationNotes?: string }) {
    if (!profile) return;
    setActing(id);
    await updateChangeStatus(id, status, profile.displayName ?? profile.email, extra);
    setChanges((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
    setActing(null);
    setPostId(null);
    setPostNotes("");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Post-implementation modal */}
      {postId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-4">Post-Implementation Notes</h3>
            <textarea value={postNotes} onChange={(e) => setPostNotes(e.target.value)} rows={4} className="input-field resize-none mb-4" placeholder="What was the outcome? Any issues encountered?" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPostId(null)} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={() => handleStatus(postId, "completed", { postImplementationNotes: postNotes })} className="btn-primary text-xs px-5">Mark Completed</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Change Management</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">IT change requests, approvals and implementation log</p>
        </div>
        <Link href="/dashboard/changes/new" className="btn-primary text-xs px-4 py-2.5">+ New Change Request</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total",       value: changes.length,                                     color: "text-white" },
          { label: "Pending",     value: changes.filter((c) => c.status === "pending_approval").length, color: "text-amber-400" },
          { label: "Approved",    value: changes.filter((c) => c.status === "approved").length,   color: "text-blue-400" },
          { label: "In Progress", value: changes.filter((c) => c.status === "in_progress").length, color: "text-purple-400" },
          { label: "Completed",   value: changes.filter((c) => c.status === "completed").length,   color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {["all","draft","pending_approval","approved","in_progress","completed","failed","cancelled"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
              filter === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No change requests found.</p>
              <Link href="/dashboard/changes/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">Create first change request →</Link>
            </div>
          ) : filtered.map((chg) => (
            <div key={chg.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <span className="font-orbitron text-xs text-accent">{chg.changeRef}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", CHANGE_STATUS_STYLES[chg.status])}>
                      {chg.status.replace("_", " ")}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", CHANGE_RISK_STYLES[chg.risk])}>
                      {chg.risk} risk
                    </span>
                    <span className="text-[10px] text-white/30 font-helvetica">{CHANGE_TYPE_LABELS[chg.type]}</span>
                  </div>
                  <p className="text-sm font-semibold text-white font-helvetica">{chg.title}</p>
                  <p className="text-xs text-white/40 font-helvetica mt-0.5">{chg.affectedSystems}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-[10px] text-white/25 font-helvetica">By {chg.requestedBy}</span>
                    {chg.scheduledStart && <span className="text-[10px] text-white/25 font-helvetica">Scheduled {fmtDate(chg.scheduledStart)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {canApprove && chg.status === "pending_approval" && (
                    <>
                      <button onClick={() => handleStatus(chg.id, "approved")} disabled={acting === chg.id}
                        className="text-xs text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                        Approve
                      </button>
                      <button onClick={() => handleStatus(chg.id, "cancelled")} disabled={acting === chg.id}
                        className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                        Reject
                      </button>
                    </>
                  )}
                  {chg.status === "approved" && (
                    <button onClick={() => handleStatus(chg.id, "in_progress")} disabled={acting === chg.id}
                      className="text-xs text-purple-400 border border-purple-500/20 hover:bg-purple-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                      Start Implementation
                    </button>
                  )}
                  {chg.status === "in_progress" && (
                    <>
                      <button onClick={() => setPostId(chg.id)}
                        className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                        Mark Completed
                      </button>
                      <button onClick={() => handleStatus(chg.id, "failed")} disabled={acting === chg.id}
                        className="text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                        Mark Failed
                      </button>
                    </>
                  )}
                </div>
              </div>
              {chg.postImplementationNotes && (
                <div className="mt-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-emerald-400/60 font-helvetica uppercase tracking-wider mb-1">Post-Implementation</p>
                  <p className="text-xs text-white/60 font-helvetica">{chg.postImplementationNotes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
