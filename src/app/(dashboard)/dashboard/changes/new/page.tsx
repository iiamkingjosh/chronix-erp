"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createChange } from "@/lib/change-service";
import { CHANGE_TYPE_LABELS, generateChangeRef } from "@/types/change";
import type { ChangeType, ChangeRisk } from "@/types/change";

const TYPES = Object.entries(CHANGE_TYPE_LABELS) as [ChangeType, string][];

export default function NewChangePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", type: "normal" as ChangeType, risk: "medium" as ChangeRisk,
    description: "", affectedSystems: "", rollbackPlan: "",
    scheduledStart: "", scheduledEnd: "", assignedTo: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true); setError(null);
    try {
      await createChange({
        changeRef:       generateChangeRef(),
        title:           form.title,
        type:            form.type,
        risk:            form.risk,
        description:     form.description,
        affectedSystems: form.affectedSystems,
        rollbackPlan:    form.rollbackPlan,
        scheduledStart:  form.scheduledStart || undefined,
        scheduledEnd:    form.scheduledEnd || undefined,
        assignedTo:      form.assignedTo || undefined,
        status:          "pending_approval",
        requestedBy:     profile.displayName ?? profile.email,
        requestedByUid:  profile.uid,
        createdAt:       new Date().toISOString(),
      });
      router.push("/dashboard/changes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">New Change Request</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Submit for System Admin / CEO approval</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div>
          <label className="field-label">Change Title</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Brief title of the change" className="input-field" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Type</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className="input-field">
              {TYPES.map(([v, l]) => <option key={v} value={v} className="bg-primary-dark">{l}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Risk Level</label>
            <select value={form.risk} onChange={(e) => set("risk", e.target.value)} className="input-field">
              {["low","medium","high","critical"].map((r) => <option key={r} value={r} className="bg-primary-dark capitalize">{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className="input-field resize-none" placeholder="What is being changed and why?" required />
        </div>
        <div>
          <label className="field-label">Affected Systems</label>
          <input value={form.affectedSystems} onChange={(e) => set("affectedSystems", e.target.value)} placeholder="e.g. Firewall, Domain Controller, Client VPN" className="input-field" required />
        </div>
        <div>
          <label className="field-label">Rollback Plan</label>
          <textarea value={form.rollbackPlan} onChange={(e) => set("rollbackPlan", e.target.value)} rows={3} className="input-field resize-none" placeholder="How will you revert if something goes wrong?" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Scheduled Start</label>
            <input type="datetime-local" value={form.scheduledStart} onChange={(e) => set("scheduledStart", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">Scheduled End</label>
            <input type="datetime-local" value={form.scheduledEnd} onChange={(e) => set("scheduledEnd", e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <label className="field-label">Assigned Engineer</label>
          <input value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="Engineer name" className="input-field" />
        </div>
        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Submitting…" : "Submit for Approval"}</button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}
