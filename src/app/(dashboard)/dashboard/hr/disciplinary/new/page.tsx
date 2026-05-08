"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createDiscEntry } from "@/lib/disciplinary-service";
import { getEmployees } from "@/lib/hr-service";
import { DISC_ACTION_LABELS } from "@/types/disciplinary";
import type { DiscAction } from "@/types/disciplinary";
import { useEffect } from "react";
import type { Employee } from "@/types/hr";
import { hasPermission } from "@/types/roles";

const ACTIONS = Object.entries(DISC_ACTION_LABELS) as [DiscAction, string][];

export default function NewDiscPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    employeeUid: "", action: "query" as DiscAction,
    subject: "", description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:hr") || profile.role === "CEO" : false;

  useEffect(() => {
    getEmployees().then(setEmployees);
  }, []);

  if (!canManage) return <div className="animate-fade-in text-white/40 font-helvetica text-sm p-8">Access restricted.</div>;

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.employeeUid || !form.subject.trim() || !form.description.trim()) return;
    setSaving(true); setError(null);
    const emp = employees.find((e) => e.uid === form.employeeUid);
    if (!emp) { setError("Employee not found"); setSaving(false); return; }
    try {
      await createDiscEntry({
        employeeUid:  emp.uid,
        employeeName: emp.fullName,
        department:   emp.department,
        action:       form.action,
        subject:      form.subject,
        description:  form.description,
        status:       "open",
        issuedBy:     profile.displayName ?? profile.email,
        issuedAt:     new Date().toISOString(),
      });
      router.push("/dashboard/hr/disciplinary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">New Disciplinary Record</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Confidential — HR &amp; CEO only</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div>
          <label className="field-label">Employee</label>
          <select value={form.employeeUid} onChange={(e) => set("employeeUid", e.target.value)} className="input-field" required>
            <option value="" className="bg-primary-dark">Select employee…</option>
            {employees.map((emp) => <option key={emp.uid} value={emp.uid} className="bg-primary-dark">{emp.fullName} — {emp.department}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Action Type</label>
          <select value={form.action} onChange={(e) => set("action", e.target.value)} className="input-field">
            {ACTIONS.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Subject / Summary</label>
          <input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Brief summary of the issue" className="input-field" required />
        </div>
        <div>
          <label className="field-label">Full Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={5} className="input-field resize-none" placeholder="Detailed account of the incident, dates, witnesses…" required />
        </div>
        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Create Record"}
          </button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
