"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIncidents, updateIncidentStatus } from "@/lib/incident-service";
import { INCIDENT_SEVERITY_STYLES, INCIDENT_SEVERITY_LABELS, INCIDENT_STATUS_STYLES } from "@/types/incident";
import type { Incident, IncidentStatus } from "@/types/incident";
import { cn } from "@/lib/utils";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function duration(start: string, end?: string) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [acting, setActing]       = useState<string | null>(null);

  useEffect(() => { getIncidents().then(setIncidents).finally(() => setLoading(false)); }, []);

  const filtered = filter === "all" ? incidents : incidents.filter((i) => i.status === filter);
  const active   = incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length;

  async function handleStatus(id: string, status: IncidentStatus) {
    setActing(id);
    await updateIncidentStatus(id, status);
    setIncidents((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
    setActing(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Incident Management</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            {active > 0 ? <span className="text-red-400 font-semibold">{active} active incident{active !== 1 ? "s" : ""}</span> : "No active incidents"}
          </p>
        </div>
        <Link href="/dashboard/incidents/new" className="btn-primary text-xs px-4 py-2.5">+ Declare Incident</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {["P1","P2","P3","P4"].map((sev) => {
          const count = incidents.filter((i) => i.severity === sev).length;
          return (
            <div key={sev} className="surface-card p-5 text-center">
              <p className={cn("font-orbitron text-2xl font-bold", INCIDENT_SEVERITY_STYLES[sev as "P1"].split(" ")[1])}>{count}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">{INCIDENT_SEVERITY_LABELS[sev as "P1"]}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {["all","open","investigating","mitigated","resolved","closed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
              filter === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="surface-card px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No incidents found.</p></div>
          ) : filtered.map((inc) => (
            <div key={inc.id} className={cn("surface-card px-5 py-4 border", inc.severity === "P1" && inc.status !== "closed" ? "border-red-500/30" : "border-white/5")}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <span className="font-orbitron text-xs text-accent">{inc.incidentRef}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", INCIDENT_SEVERITY_STYLES[inc.severity])}>
                      {inc.severity}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", INCIDENT_STATUS_STYLES[inc.status])}>
                      {inc.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white font-helvetica">{inc.title}</p>
                  <p className="text-xs text-white/40 font-helvetica mt-0.5">{inc.affectedServices}</p>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    <span className="text-[10px] text-white/25 font-helvetica">Lead: {inc.incidentLead}</span>
                    <span className="text-[10px] text-white/25 font-helvetica">Detected: {fmtDate(inc.detectedAt)}</span>
                    <span className="text-[10px] text-white/25 font-helvetica">Duration: {duration(inc.detectedAt, inc.resolvedAt)}</span>
                    {inc.updates.length > 0 && <span className="text-[10px] text-white/25 font-helvetica">{inc.updates.length} update{inc.updates.length !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <Link href={`/dashboard/incidents/${inc.id}`} className="text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                    View
                  </Link>
                  {inc.status === "open" && (
                    <button onClick={() => handleStatus(inc.id, "investigating")} disabled={acting === inc.id}
                      className="text-xs text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                      Investigating
                    </button>
                  )}
                  {inc.status === "investigating" && (
                    <button onClick={() => handleStatus(inc.id, "mitigated")} disabled={acting === inc.id}
                      className="text-xs text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                      Mitigated
                    </button>
                  )}
                  {(inc.status === "mitigated" || inc.status === "investigating") && (
                    <button onClick={() => handleStatus(inc.id, "resolved")} disabled={acting === inc.id}
                      className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica transition-colors">
                      Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
