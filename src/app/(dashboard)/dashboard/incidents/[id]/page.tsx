"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getIncident, updateIncidentStatus, addIncidentUpdate, closeIncidentWithRCA } from "@/lib/incident-service";
import { INCIDENT_SEVERITY_STYLES, INCIDENT_SEVERITY_LABELS, INCIDENT_STATUS_STYLES } from "@/types/incident";
import type { Incident, IncidentStatus } from "@/types/incident";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { cn } from "@/lib/utils";

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
}

export default function IncidentDetailPage() {
  const { id }                    = useParams() as { id: string };
  const router                    = useRouter();
  const { profile }               = useAuth();
  const [incident, setIncident]   = useState<Incident | null>(null);
  const [loading, setLoading]     = useState(true);
  const [update, setUpdate]       = useState("");
  const [rcaForm, setRcaForm]     = useState({ rootCause: "", actionsTaken: "", preventionPlan: "" });
  const [showRCA, setShowRCA]     = useState(false);
  const [acting, setActing]       = useState(false);

  useEffect(() => { getIncident(id).then(setIncident).finally(() => setLoading(false)); }, [id]);

  async function handleAddUpdate() {
    if (!incident || !profile || !update.trim()) return;
    setActing(true);
    const upd = { id: Date.now().toString(), authorName: profile.displayName ?? profile.email, message: update, timestamp: new Date().toISOString() };
    await addIncidentUpdate(incident.id, upd);
    setIncident((prev) => prev ? { ...prev, updates: [...prev.updates, upd] } : prev);
    setUpdate(""); setActing(false);
  }

  async function handleStatus(status: IncidentStatus) {
    if (!incident || !profile) return;
    setActing(true);
    await updateIncidentStatus(incident.id, status);
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "incidents", entityId: incident.id, entityRef: incident.incidentRef, details: `Incident ${incident.incidentRef} status changed to ${status}`, timestamp: new Date().toISOString() });
    setIncident((prev) => prev ? { ...prev, status } : prev);
    setActing(false);
  }

  async function handleCloseRCA() {
    if (!incident || !profile || !rcaForm.rootCause.trim()) return;
    setActing(true);
    await closeIncidentWithRCA(incident.id, rcaForm.rootCause, rcaForm.actionsTaken, rcaForm.preventionPlan);
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "resolve", module: "incidents", entityId: incident.id, entityRef: incident.incidentRef, details: `Incident ${incident.incidentRef} closed with RCA`, timestamp: new Date().toISOString() });
    setIncident((prev) => prev ? { ...prev, status: "closed", ...rcaForm } : prev);
    setShowRCA(false); setActing(false);
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  if (!incident) return <div className="p-8 text-white/40 font-helvetica">Incident not found. <button onClick={() => router.back()} className="text-accent hover:underline">Go back</button></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      {/* RCA modal */}
      {showRCA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-lg p-6 mx-4 space-y-4">
            <h3 className="font-orbitron text-sm font-bold text-white">Post-Incident Review / RCA</h3>
            {[["rootCause","Root Cause"],["actionsTaken","Actions Taken"],["preventionPlan","Prevention Plan"]].map(([k, label]) => (
              <div key={k}>
                <label className="field-label">{label}</label>
                <textarea value={rcaForm[k as keyof typeof rcaForm]} onChange={(e) => setRcaForm((p) => ({ ...p, [k]: e.target.value }))} rows={3} className="input-field resize-none" />
              </div>
            ))}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRCA(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleCloseRCA} disabled={!rcaForm.rootCause.trim() || acting} className="btn-primary text-xs px-5">{acting ? "Closing…" : "Close with RCA"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <span className="font-orbitron text-xs text-accent">{incident.incidentRef}</span>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", INCIDENT_SEVERITY_STYLES[incident.severity])}>{incident.severity}</span>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", INCIDENT_STATUS_STYLES[incident.status])}>{incident.status}</span>
        <div className="ml-auto flex gap-2">
          {incident.status === "open"          && <button onClick={() => handleStatus("investigating")} className="text-xs text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg font-helvetica">Investigating</button>}
          {incident.status === "investigating" && <button onClick={() => handleStatus("mitigated")}     className="text-xs text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg font-helvetica">Mitigated</button>}
          {(incident.status === "mitigated" || incident.status === "investigating") && <button onClick={() => handleStatus("resolved")} className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica">Resolved</button>}
          {incident.status === "resolved"      && <button onClick={() => setShowRCA(true)}              className="text-xs text-white/60 border border-white/20 hover:bg-white/5 px-3 py-1.5 rounded-lg font-helvetica">Close with RCA</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="surface-card p-6">
            <h1 className="font-orbitron text-lg font-bold text-white mb-4">{incident.title}</h1>
            <dl className="grid grid-cols-2 gap-3 text-sm font-helvetica mb-4">
              <div><dt className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Severity</dt><dd className="text-white">{INCIDENT_SEVERITY_LABELS[incident.severity]}</dd></div>
              <div><dt className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Lead</dt><dd className="text-white">{incident.incidentLead}</dd></div>
              <div><dt className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Affected Services</dt><dd className="text-white">{incident.affectedServices}</dd></div>
              {incident.clientsAffected && <div><dt className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Clients Affected</dt><dd className="text-white">{incident.clientsAffected}</dd></div>}
            </dl>
            <p className="text-sm text-white/60 font-helvetica">{incident.description}</p>
          </div>

          {/* Updates timeline */}
          <div className="surface-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest">Timeline</h3>
            </div>
            <div className="divide-y divide-white/5">
              {incident.updates.length === 0 ? (
                <div className="px-5 py-8 text-center"><p className="text-white/20 text-sm font-helvetica">No updates yet.</p></div>
              ) : [...incident.updates].reverse().map((u) => (
                <div key={u.id} className="px-5 py-3">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-semibold text-white font-helvetica">{u.authorName}</span>
                    <span className="text-[10px] text-white/25 font-helvetica">{fmtTime(u.timestamp)}</span>
                  </div>
                  <p className="text-sm text-white/60 font-helvetica">{u.message}</p>
                </div>
              ))}
            </div>
            {incident.status !== "closed" && (
              <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                <input value={update} onChange={(e) => setUpdate(e.target.value)} placeholder="Post an update…" className="input-field flex-1 text-sm" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddUpdate(); }}} />
                <button onClick={handleAddUpdate} disabled={!update.trim() || acting} className="btn-primary text-xs px-4">Post</button>
              </div>
            )}
          </div>

          {/* RCA */}
          {incident.rootCause && (
            <div className="surface-card p-6 space-y-4">
              <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest">Post-Incident Review</h3>
              {[["Root Cause", incident.rootCause], ["Actions Taken", incident.actionsTaken], ["Prevention Plan", incident.preventionPlan]].map(([label, val]) => val && (
                <div key={label as string}>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-helvetica mb-1">{label}</p>
                  <p className="text-sm text-white/70 font-helvetica">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
