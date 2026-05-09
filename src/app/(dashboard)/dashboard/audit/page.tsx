"use client";

import { useEffect, useState } from "react";
import { getAuditLogs } from "@/lib/audit-service";
import type { AuditLog, AuditModule, AuditAction } from "@/lib/audit-service";
import { useAuth } from "@/contexts/AuthContext";
import { isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

const ACTION_STYLES: Record<AuditAction, string> = {
  create:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  update:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  delete:  "bg-red-500/15 text-red-400 border-red-500/30",
  approve: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  reject:  "bg-red-500/15 text-red-400 border-red-500/30",
  login:   "bg-white/8 text-white/40 border-white/15",
  logout:  "bg-white/8 text-white/30 border-white/10",
  assign:  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  resolve: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  export:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const MODULES: AuditModule[] = [
  "invoices","expenses","leave","disciplinary","assets","time",
  "tickets","projects","crm","hr","procurement","subscriptions",
  "knowledge","incidents","changes","users",
];

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AuditLogPage() {
  const { profile }           = useAuth();
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modFilter, setModFilter] = useState("all");
  const [search, setSearch]   = useState("");

  const canView = profile
    ? isRootAdmin(profile.role) || profile.role === "CEO" || profile.role === "System Admin"
    : false;

  useEffect(() => {
    if (!canView) return;
    getAuditLogs(500).then(setLogs).finally(() => setLoading(false));
  }, [canView]);

  if (!canView) {
    return (
      <div className="p-8 text-center">
        <p className="text-white/30 font-helvetica text-sm">Audit log is restricted to CEO and System Admin.</p>
      </div>
    );
  }

  const filtered = logs
    .filter((l) => modFilter === "all" || l.module === modFilter)
    .filter((l) => !search || l.actorName.toLowerCase().includes(search.toLowerCase()) || (l.details ?? "").toLowerCase().includes(search.toLowerCase()) || (l.entityRef ?? "").toLowerCase().includes(search.toLowerCase()));

  function exportCSV() {
    const bom = "﻿";
    const csv = bom + [["Timestamp", "Actor", "Role", "Action", "Module", "Entity", "Details"].join(","),
      ...filtered.map((l) => [l.timestamp, l.actorName, l.actorRole, l.action, l.module, l.entityRef ?? "", l.details ?? ""].map((c) => `"${c}"`).join(","))
    ].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "audit-log.csv"; a.click();
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Complete action trail across all modules</p>
        </div>
        <button onClick={exportCSV} className="text-xs text-white/60 hover:text-white font-helvetica border border-white/15 hover:border-white/30 px-3 py-2 rounded-lg transition-colors">
          Export CSV
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, entity, details…" className="input-field flex-1 min-w-[200px]" />
        <select value={modFilter} onChange={(e) => setModFilter(e.target.value)} className="input-field w-44">
          <option value="all" className="bg-primary-dark">All Modules</option>
          {MODULES.map((m) => <option key={m} value={m} className="bg-primary-dark capitalize">{m}</option>)}
        </select>
      </div>

      <div className="text-xs text-white/30 font-helvetica mb-3">{filtered.length} events</div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No audit events found.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Timestamp</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actor</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Action</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Module</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Entity</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-xs text-white/40 font-helvetica whitespace-nowrap">{fmtTime(log.timestamp)}</td>
                      <td className="px-5 py-3">
                        <p className="text-sm text-white font-helvetica">{log.actorName}</p>
                        <p className="text-[10px] text-white/30 font-helvetica">{log.actorRole}</p>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", ACTION_STYLES[log.action])}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white/5 text-white/40 border-white/10 font-helvetica capitalize">{log.module}</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-white/50 font-helvetica">{log.entityRef ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-white/50 font-helvetica max-w-xs truncate">{log.details ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
