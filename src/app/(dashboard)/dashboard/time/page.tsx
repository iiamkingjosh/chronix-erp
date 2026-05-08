"use client";

import { useEffect, useState } from "react";
import { getAllTimeEntries, getMyTimeEntries, createTimeEntry } from "@/lib/timetrack-service";
import { TIME_ENTRY_TYPE_LABELS, TIME_ENTRY_TYPE_STYLES } from "@/types/timetrack";
import type { TimeEntry, TimeEntryType } from "@/types/timetrack";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const today = new Date().toISOString().split("T")[0];
const TYPES = Object.entries(TIME_ENTRY_TYPE_LABELS) as [TimeEntryType, string][];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TimeTrackingPage() {
  const { profile }               = useAuth();
  const [entries, setEntries]     = useState<TimeEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [form, setForm]           = useState({
    type: "ticket" as TimeEntryType,
    linkedRef: "", description: "",
    date: today, hours: "", billable: true,
    clientName: "",
  });

  const canViewAll = profile ? hasPermission(profile.role, "manage:hr") || profile.role === "CEO" || profile.role === "CFO" || profile.role === "System Admin" : false;

  useEffect(() => {
    if (!profile) return;
    const load = canViewAll ? getAllTimeEntries() : getMyTimeEntries(profile.uid);
    load.then(setEntries).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, canViewAll]);

  const filtered = filterType === "all" ? entries : entries.filter((e) => e.type === filterType);

  const totalHours    = filtered.reduce((s, e) => s + e.hours, 0);
  const billableHours = filtered.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);

  function setF(k: string, v: string | boolean) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.description || !form.hours) return;
    setSaving(true);
    try {
      const entry = await createTimeEntry({
        employeeUid:  profile.uid,
        employeeName: profile.displayName ?? profile.email,
        type:         form.type,
        linkedRef:    form.linkedRef || undefined,
        description:  form.description,
        date:         form.date,
        hours:        Number(form.hours),
        billable:     form.billable,
        clientName:   form.clientName || undefined,
        createdAt:    new Date().toISOString(),
      });
      setEntries((prev) => [entry, ...prev]);
      setShowForm(false);
      setForm({ type: "ticket", linkedRef: "", description: "", date: today, hours: "", billable: true, clientName: "" });
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Time Tracking</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Log billable and non-billable hours per ticket, project or client</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ Log Time</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Hours",    value: `${totalHours.toFixed(1)}h`,    color: "text-white" },
          { label: "Billable Hours", value: `${billableHours.toFixed(1)}h`, color: "text-emerald-400" },
          { label: "Non-Billable",   value: `${(totalHours - billableHours).toFixed(1)}h`, color: "text-white/50" },
          { label: "Entries",        value: filtered.length,                 color: "text-accent" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn("font-orbitron text-xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Log form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="surface-card p-6 mb-6 border border-accent/20 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Log Time Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="field-label">Type</label>
              <select value={form.type} onChange={(e) => setF("type", e.target.value)} className="input-field">
                {TYPES.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Reference (Ticket/Project ID)</label>
              <input value={form.linkedRef} onChange={(e) => setF("linkedRef", e.target.value)} placeholder="e.g. TKT-001" className="input-field" />
            </div>
            <div>
              <label className="field-label">Client</label>
              <input value={form.clientName} onChange={(e) => setF("clientName", e.target.value)} placeholder="Client name" className="input-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Description</label>
              <input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="What did you work on?" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Hours Logged</label>
              <input type="number" min="0.25" step="0.25" value={form.hours} onChange={(e) => setF("hours", e.target.value)} placeholder="2.5" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setF("date", e.target.value)} className="input-field" required />
            </div>
            <div className="flex items-center gap-3 mt-5">
              <input type="checkbox" id="billable" checked={form.billable} onChange={(e) => setF("billable", e.target.checked)} className="w-4 h-4 accent-accent" />
              <label htmlFor="billable" className="text-sm text-white/70 font-helvetica cursor-pointer">Billable</label>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Log Entry"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {["all", ...TYPES.map(([v]) => v)].map((f) => (
          <button key={f} onClick={() => setFilterType(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
              filterType === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f === "all" ? "All" : TIME_ENTRY_TYPE_LABELS[f as TimeEntryType]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No time entries yet.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Description</th>
                    {canViewAll && <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Engineer</th>}
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Type</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                    <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Hours</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Billable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-white font-helvetica">{entry.description}</p>
                        {entry.linkedRef  && <p className="text-xs text-white/30 font-helvetica">Ref: {entry.linkedRef}</p>}
                        {entry.clientName && <p className="text-xs text-accent/70 font-helvetica">{entry.clientName}</p>}
                      </td>
                      {canViewAll && <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{entry.employeeName}</td>}
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", TIME_ENTRY_TYPE_STYLES[entry.type])}>
                          {TIME_ENTRY_TYPE_LABELS[entry.type]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{fmtDate(entry.date)}</td>
                      <td className="px-5 py-3.5 text-sm font-bold text-white font-orbitron text-right">{entry.hours}h</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", entry.billable ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/8 text-white/30 border-white/15")}>
                          {entry.billable ? "Billable" : "Non-billable"}
                        </span>
                      </td>
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
