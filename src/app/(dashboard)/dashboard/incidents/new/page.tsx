"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { createIncident } from "@/lib/incident-service";
import { generateIncidentRef } from "@/types/incident";
import { getStaffList, type StaffMember } from "@/lib/tickets-service";
import { notifyAssignment } from "@/lib/notifications-service";
import type { IncidentSeverity } from "@/types/incident";

export default function NewIncidentPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState({
    title: "", severity: "P2" as IncidentSeverity,
    description: "", affectedServices: "", clientsAffected: "",
    assignedLeadUid: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStaffList()
      .then(setStaff)
      .catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const selectedLead = form.assignedLeadUid
        ? staff.find((s) => s.uid === form.assignedLeadUid)
        : null;
      const incidentLeadUid  = selectedLead?.uid  ?? profile.uid;
      const incidentLeadName = selectedLead?.displayName ?? profile.displayName ?? profile.email;

      const inc = await createIncident({
        incidentRef:      generateIncidentRef(),
        title:            form.title,
        severity:         form.severity,
        description:      form.description,
        affectedServices: form.affectedServices,
        clientsAffected:  form.clientsAffected || undefined,
        status:           "open",
        incidentLead:     incidentLeadName,
        incidentLeadUid,
        detectedAt:       now,
        updates:          [],
        createdAt:        now,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "incidents", entityId: inc.id, entityRef: inc.incidentRef, details: `Incident declared: ${form.title} (${form.severity}) — ${form.affectedServices}`, timestamp: now });

      if (incidentLeadUid !== profile.uid) {
        notifyAssignment({
          type:         "incident_assigned",
          title:        "Incident Assigned to You",
          message:      `Incident "${form.title}" (${form.severity}) has been assigned to you as Incident Lead.`,
          link:         `/dashboard/incidents/${inc.id}`,
          assigneeUid:  incidentLeadUid,
          assigneeName: incidentLeadName,
          dedupeKey:    `incident-assigned-${inc.id}-${incidentLeadUid}`,
          extraRoles:   ["Root Admin", "System Admin", "IT Manager"],
        }).catch(() => {});
      }

      router.push(`/dashboard/incidents/${inc.id}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">Declare Incident</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Start incident timeline immediately</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div>
          <label className="field-label">Incident Title</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Brief description of the incident" className="input-field" required />
        </div>
        <div>
          <label className="field-label">Severity</label>
          <select value={form.severity} onChange={(e) => set("severity", e.target.value)} className="input-field">
            <option value="P1" className="bg-primary-dark">P1 — Critical (complete outage)</option>
            <option value="P2" className="bg-primary-dark">P2 — Major (partial outage)</option>
            <option value="P3" className="bg-primary-dark">P3 — Minor (degraded service)</option>
            <option value="P4" className="bg-primary-dark">P4 — Low (no impact)</option>
          </select>
        </div>
        <div>
          <label className="field-label">Affected Services</label>
          <input value={form.affectedServices} onChange={(e) => set("affectedServices", e.target.value)} placeholder="e.g. Email, VPN, Client Portal" className="input-field" required />
        </div>
        <div>
          <label className="field-label">Clients Affected (optional)</label>
          <input value={form.clientsAffected} onChange={(e) => set("clientsAffected", e.target.value)} placeholder="List affected client names" className="input-field" />
        </div>
        <div>
          <label className="field-label">Assign Incident Lead</label>
          <select value={form.assignedLeadUid} onChange={(e) => set("assignedLeadUid", e.target.value)} className="input-field">
            <option value="" className="bg-primary-dark">{profile?.displayName ?? profile?.email ?? "Me"} (Me)</option>
            {staff
              .filter((s) => s.uid !== profile?.uid)
              .map((s) => (
                <option key={s.uid} value={s.uid} className="bg-primary-dark">
                  {s.displayName} ({s.role})
                </option>
              ))}
          </select>
          <p className="mt-1 text-[10px] text-white/25 font-helvetica">Defaults to you · assignee will be notified</p>
        </div>
        <div>
          <label className="field-label">Initial Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} className="input-field resize-none" placeholder="What is happening? What do you know so far?" required />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Declaring…" : "Declare Incident"}</button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}
