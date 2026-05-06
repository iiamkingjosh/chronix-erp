"use client";

import { useEffect, useState } from "react";
import { getEmployees, addPerformanceNote } from "@/lib/hr-service";
import type { Employee, PerformanceNote } from "@/types/hr";
import { PERFORMANCE_PERIODS, formatHrDateTime } from "@/types/hr";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function PerformancePage() {
  const { profile } = useAuth();
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selEmp, setSelEmp]         = useState("");
  const [selPeriod, setSelPeriod]   = useState(PERFORMANCE_PERIODS[0]);
  const [rating, setRating]         = useState(4);
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [filterEmp, setFilterEmp]   = useState("all");

  const canManage = profile ? hasPermission(profile.role, "manage:hr") : false;

  useEffect(() => {
    getEmployees().then((emps) => {
      setEmployees(emps);
      if (emps.length > 0) setSelEmp(emps[0].uid);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!profile || !selEmp || !notes.trim()) return;
    const emp = employees.find((e) => e.uid === selEmp);
    if (!emp) return;
    setSaving(true);
    try {
      const note: PerformanceNote = {
        id:          Date.now().toString(),
        period:      selPeriod,
        rating,
        notes:       notes.trim(),
        addedBy:     profile.uid,
        addedByName: profile.displayName ?? profile.email,
        createdAt:   new Date().toISOString(),
      };
      await addPerformanceNote(emp.uid, note);
      setEmployees((prev) =>
        prev.map((e) => e.uid === emp.uid ? { ...e, performanceNotes: [...(e.performanceNotes ?? []), note] } : e)
      );
      setNotes("");
    } finally { setSaving(false); }
  }

  // Flatten all performance notes with employee name
  type FlatNote = PerformanceNote & { empName: string; empUid: string };
  const allNotes: FlatNote[] = employees
    .filter((e) => filterEmp === "all" || e.uid === filterEmp)
    .flatMap((e) => (e.performanceNotes ?? []).map((n) => ({ ...n, empName: e.fullName, empUid: e.uid })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!canManage) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Access restricted to HR managers.</p></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Add note form */}
        <div className="lg:col-span-1">
          <div className="surface-card p-6 sticky top-8">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Add Performance Note</h3>
            <div className="space-y-4">
              <div>
                <label className="field-label">Employee</label>
                <select value={selEmp} onChange={(e) => setSelEmp(e.target.value)} className="input-field">
                  {employees.map((e) => <option key={e.uid} value={e.uid} className="bg-primary-dark">{e.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Period</label>
                <select value={selPeriod} onChange={(e) => setSelPeriod(e.target.value)} className="input-field">
                  {PERFORMANCE_PERIODS.map((p) => <option key={p} value={p} className="bg-primary-dark">{p}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Rating</label>
                <div className="flex items-center gap-1 h-10">
                  {[1,2,3,4,5].map((s) => (
                    <button key={s} type="button" onClick={() => setRating(s)}
                      className={cn("text-2xl transition-colors", s <= rating ? "text-amber-400" : "text-white/15 hover:text-white/40")}>
                      ★
                    </button>
                  ))}
                  <span className="text-sm text-amber-400 font-orbitron font-bold ml-2">{rating}/5</span>
                </div>
              </div>
              <div>
                <label className="field-label">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Key achievements, areas for improvement, targets for next period…" className="input-field resize-none" />
              </div>
              <button onClick={handleSave} disabled={saving || !selEmp || !notes.trim()} className="btn-primary w-full">
                {saving ? "Saving…" : "Add Note"}
              </button>
            </div>
          </div>
        </div>

        {/* Notes history */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">
              Review History ({allNotes.length})
            </h3>
            <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="input-field py-2 w-48">
              <option value="all" className="bg-primary-dark">All employees</option>
              {employees.map((e) => <option key={e.uid} value={e.uid} className="bg-primary-dark">{e.fullName}</option>)}
            </select>
          </div>

          {allNotes.length === 0 ? (
            <div className="surface-card px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No performance notes yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allNotes.map((note) => (
                <div key={`${note.empUid}-${note.id}`} className="surface-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-xs font-bold text-secondary shrink-0">
                        {note.empName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white font-helvetica">{note.empName}</p>
                        <p className="text-[10px] text-white/30 font-helvetica">{note.addedByName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-orbitron text-xs text-accent">{note.period}</span>
                      <div className="text-amber-400 text-base mt-0.5">
                        {"★".repeat(note.rating)}{"☆".repeat(5 - note.rating)}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-white/60 font-helvetica leading-relaxed">{note.notes}</p>
                  <p className="text-[10px] text-white/20 font-helvetica mt-2">{formatHrDateTime(note.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
