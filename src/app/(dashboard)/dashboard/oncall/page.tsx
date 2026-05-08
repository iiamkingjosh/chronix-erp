"use client";

import { useEffect, useState } from "react";
import { getOnCallSlots, createOnCallSlot, deleteOnCallSlot, getCurrentOnCall } from "@/lib/oncall-service";
import { getEmployees } from "@/lib/hr-service";
import type { OnCallSlot } from "@/types/oncall";
import type { Employee } from "@/types/hr";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

function weekStart(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7);
  return d.toISOString().split("T")[0];
}
function weekEnd(start: string): string {
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}
function fmtWeek(start: string, end: string) {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const e = new Date(end   + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${s} — ${e}`;
}

export default function OnCallPage() {
  const { profile }             = useAuth();
  const [slots, setSlots]       = useState<OnCallSlot[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ engineerUid: "", weekStartDate: weekStart(), notes: "" });
  const [saving, setSaving]     = useState(false);

  const canManage = profile ? hasPermission(profile.role, "manage:hr") || profile.role === "System Admin" : false;

  useEffect(() => {
    Promise.all([getOnCallSlots(), getEmployees()])
      .then(([s, e]) => { setSlots(s); setEmployees(e); })
      .finally(() => setLoading(false));
  }, []);

  const current = getCurrentOnCall(slots);
  const upcoming = slots.filter((s) => s.weekStart > new Date().toISOString().split("T")[0]).slice(0, 8);
  const past     = slots.filter((s) => s.weekEnd   < new Date().toISOString().split("T")[0]).slice(0, 6);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.engineerUid) return;
    setSaving(true);
    const emp = employees.find((em) => em.uid === form.engineerUid);
    if (!emp) { setSaving(false); return; }
    const wEnd = weekEnd(form.weekStartDate);
    const slot = await createOnCallSlot({
      engineerUid:  emp.uid,
      engineerName: emp.fullName,
      weekStart:    form.weekStartDate,
      weekEnd:      wEnd,
      notes:        form.notes || undefined,
      createdBy:    profile.displayName ?? profile.email,
      createdAt:    new Date().toISOString(),
    });
    setSlots((prev) => [...prev, slot].sort((a, b) => a.weekStart.localeCompare(b.weekStart)));
    setShowForm(false);
    setForm({ engineerUid: "", weekStartDate: weekStart(), notes: "" });
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await deleteOnCallSlot(id);
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">On-Call Schedule</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Weekly engineer rotation for critical escalations</p>
        </div>
        {canManage && <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ Assign On-Call</button>}
      </div>

      {/* Current on-call banner */}
      {current ? (
        <div className="mb-6 flex items-center gap-4 px-5 py-4 bg-accent/8 border border-accent/25 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center font-orbitron text-sm font-bold text-accent shrink-0">
            {current.engineerName[0].toUpperCase()}
          </div>
          <div>
            <p className="text-xs text-accent/70 font-helvetica uppercase tracking-wider mb-0.5">On-Call This Week</p>
            <p className="text-base font-bold text-white font-helvetica">{current.engineerName}</p>
            <p className="text-xs text-white/40 font-helvetica">{fmtWeek(current.weekStart, current.weekEnd)}</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 px-5 py-4 bg-red-500/8 border border-red-500/20 rounded-xl">
          <p className="text-red-400 text-sm font-helvetica">No engineer assigned for this week. Assign on-call now.</p>
        </div>
      )}

      {/* Add form */}
      {showForm && canManage && (
        <form onSubmit={handleAdd} className="surface-card p-5 mb-6 border border-accent/20 animate-fade-in space-y-4">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Assign On-Call Slot</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Engineer</label>
              <select value={form.engineerUid} onChange={(e) => setForm((p) => ({ ...p, engineerUid: e.target.value }))} className="input-field" required>
                <option value="" className="bg-primary-dark">Select engineer…</option>
                {employees.map((emp) => <option key={emp.uid} value={emp.uid} className="bg-primary-dark">{emp.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Week Starting (Monday)</label>
              <input type="date" value={form.weekStartDate} onChange={(e) => setForm((p) => ({ ...p, weekStartDate: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="field-label">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" className="input-field" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Assign Slot"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && (
            <div className="surface-card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest">Upcoming Rotation</h3>
              </div>
              <div className="divide-y divide-white/5">
                {upcoming.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-white font-helvetica">{slot.engineerName}</p>
                      <p className="text-xs text-white/40 font-helvetica">{fmtWeek(slot.weekStart, slot.weekEnd)}</p>
                      {slot.notes && <p className="text-xs text-white/25 font-helvetica">{slot.notes}</p>}
                    </div>
                    {canManage && (
                      <button onClick={() => handleDelete(slot.id)} className="text-xs text-red-400 border border-red-500/15 hover:bg-red-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div className="surface-card overflow-hidden opacity-60">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="font-orbitron text-xs font-semibold text-white/20 uppercase tracking-widest">Past Rotations</h3>
              </div>
              <div className="divide-y divide-white/5">
                {past.map((slot) => (
                  <div key={slot.id} className="flex items-center gap-4 px-5 py-3">
                    <p className="text-sm text-white/50 font-helvetica flex-1">{slot.engineerName}</p>
                    <p className="text-xs text-white/25 font-helvetica">{fmtWeek(slot.weekStart, slot.weekEnd)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slots.length === 0 && (
            <div className="surface-card px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No on-call schedule set up yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
