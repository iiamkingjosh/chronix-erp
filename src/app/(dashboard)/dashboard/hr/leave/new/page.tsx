"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { createLeaveRequest } from "@/lib/leave-service";
import { LEAVE_TYPE_LABELS, calcLeaveDays } from "@/types/leave";
import type { LeaveType } from "@/types/leave";

const TYPES = Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][];
const today = new Date().toISOString().split("T")[0];

export default function NewLeavePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    leaveType: "annual" as LeaveType,
    startDate: today,
    endDate:   today,
    reason: "",
    handoverNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }
  const days = calcLeaveDays(form.startDate, form.endDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.reason.trim()) return;
    setSaving(true); setError(null);
    try {
      const req = await createLeaveRequest({
        employeeUid:   profile.uid,
        employeeName:  profile.displayName ?? profile.email,
        employeeEmail: profile.email,
        department:    profile.department,
        leaveType:     form.leaveType,
        startDate:     form.startDate,
        endDate:       form.endDate,
        days,
        reason:        form.reason,
        handoverNotes: form.handoverNotes,
        status:        "pending",
        submittedAt:   new Date().toISOString(),
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "leave", entityId: req.id, entityRef: profile.displayName ?? profile.email, details: `Leave request submitted: ${form.leaveType} ${form.startDate} to ${form.endDate} (${days} days)`, timestamp: new Date().toISOString() });
      router.push("/dashboard/hr/leave");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally { setSaving(false); }
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">Apply for Leave</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Your request will be sent to HR for review</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div>
          <label className="field-label">Leave Type</label>
          <select value={form.leaveType} onChange={(e) => set("leaveType", e.target.value)} className="input-field">
            {TYPES.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Start Date</label>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="field-label">End Date</label>
            <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} className="input-field" required />
          </div>
        </div>
        <div className="bg-accent/8 border border-accent/20 rounded-xl px-4 py-3">
          <p className="text-sm font-helvetica text-white/70">Duration: <strong className="text-accent">{days} day{days !== 1 ? "s" : ""}</strong></p>
        </div>
        <div>
          <label className="field-label">Reason for Leave</label>
          <textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={3} className="input-field resize-none" placeholder="Briefly describe the reason…" required />
        </div>
        <div>
          <label className="field-label">Handover Notes (optional)</label>
          <textarea value={form.handoverNotes} onChange={(e) => set("handoverNotes", e.target.value)} rows={2} className="input-field resize-none" placeholder="Who will cover your responsibilities? Any pending items?" />
        </div>
        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Submitting…" : "Submit Request"}
          </button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
