"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { MONTHS } from "@/types/hr";
import type { Employee } from "@/types/hr";
import type { PerformanceReview, KPIScores } from "@/types/hr";
import {
  calcOverallScore, calcEntitlement, ENTITLEMENT_STYLES,
  KPI_LABELS, KPI_LOCKED,
} from "@/types/hr";
import { cn } from "@/lib/utils";

interface Props {
  employees:       Employee[];
  defaultEmpUid?:  string;
  existingReviews: PerformanceReview[];
  onSaved:         (review: PerformanceReview) => void;
  onClose:         () => void;
}

const DEFAULT_MANUAL: Omit<KPIScores, "taskCompletionRate" | "ticketResolutionRate"> = {
  attendancePunctuality:    80,
  qualityOfWork:            80,
  communicationTeamwork:    80,
  initiativeProblemSolving: 80,
};

export default function CreateReviewModal({
  employees, defaultEmpUid, existingReviews, onSaved, onClose,
}: Props) {
  const { profile } = useAuth();
  const now = new Date();

  const [empUid,   setEmpUid]   = useState(defaultEmpUid ?? (employees[0]?.uid ?? ""));
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [year,     setYear]     = useState(now.getFullYear());
  const [locked,   setLocked]   = useState({ taskCompletionRate: 0, ticketResolutionRate: 0 });
  const [computing, setComputing] = useState(false);
  const [manual,   setManual]   = useState({ ...DEFAULT_MANUAL });
  const [comments, setComments] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const fetchLocked = useCallback(async (uid: string, m: number, y: number) => {
    if (!uid) return;
    setComputing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(
        `/api/performance/compute?uid=${uid}&month=${m}&year=${y}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json() as { taskCompletionRate: number; ticketResolutionRate: number };
        setLocked(data);
      }
    } finally {
      setComputing(false);
    }
  }, []);

  useEffect(() => {
    fetchLocked(empUid, month, year);
  }, [empUid, month, year, fetchLocked]);

  const scores: KPIScores = { ...locked, ...manual };
  const overallScore  = calcOverallScore(scores);
  const entitlement   = calcEntitlement(overallScore);
  const entitleStyle  = ENTITLEMENT_STYLES[entitlement];

  const years: number[] = [];
  for (let y = 2026; y <= now.getFullYear(); y++) years.push(y);

  async function handleSave() {
    if (!profile || !empUid) return;
    setError("");

    const periodStr = `${year}-${String(month).padStart(2, "0")}`;
    const duplicate = existingReviews.some(
      (r) => r.employeeId === empUid && r.reviewPeriod === periodStr
    );
    if (duplicate) {
      setError("A review for this employee and period already exists.");
      return;
    }

    setSaving(true);
    try {
      const newReview: Omit<PerformanceReview, "id"> = {
        employeeId:    empUid,
        reviewPeriod:  periodStr,
        kpiScores:     scores,
        overallScore,
        entitlement,
        comments,
        createdBy:     profile.uid,
        createdByName: profile.displayName ?? profile.email ?? "HR",
        createdAt:     new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, "performance_reviews"), newReview);
      onSaved({ id: ref.id, ...newReview });
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const kpiKeys = Object.keys(KPI_LABELS) as Array<keyof KPIScores>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-primary-dark border border-white/10 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-orbitron text-sm font-bold text-white tracking-widest uppercase">
            Create Performance Review
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Left: inputs */}
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-white/08 space-y-5">

            <div>
              <label className="field-label">Employee</label>
              <select
                value={empUid}
                onChange={(e) => setEmpUid(e.target.value)}
                disabled={!!defaultEmpUid}
                className={cn("input-field", defaultEmpUid && "opacity-60 cursor-not-allowed")}
              >
                {employees.map((e) => (
                  <option key={e.uid} value={e.uid} className="bg-primary-dark">
                    {e.fullName} — {e.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Review Period</label>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="input-field"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1} className="bg-primary-dark">{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="input-field"
                >
                  {years.map((y) => (
                    <option key={y} value={y} className="bg-primary-dark">{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest">KPI Scores</p>

              {kpiKeys.map((k) => {
                const isLocked = KPI_LOCKED[k];
                const value    = isLocked ? locked[k as "taskCompletionRate" | "ticketResolutionRate"] : manual[k as keyof typeof manual];
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60 font-helvetica">{KPI_LABELS[k]}</span>
                        {isLocked && (
                          <span className="text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5">
                            {computing ? "…" : "AUTO"}
                          </span>
                        )}
                      </div>
                      {isLocked ? (
                        <span className="text-sm font-bold text-blue-400">{value}%</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={value}
                          onChange={(e) => {
                            const v = Math.min(100, Math.max(0, Number(e.target.value)));
                            setManual((prev) => ({ ...prev, [k]: v }));
                          }}
                          className="w-14 bg-white/05 border border-white/12 rounded text-center text-sm font-bold text-white py-0.5"
                        />
                      )}
                    </div>
                    <div className="h-1 bg-white/06 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isLocked ? "bg-blue-500/70" : "bg-accent/80")}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Right: live summary + comments */}
          <div className="p-6 flex flex-col gap-5">
            <div className="bg-black/30 border border-white/08 rounded-lg p-4 text-center">
              <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-2">Overall Score</p>
              <p className="text-4xl font-black text-white">{overallScore}<span className="text-2xl text-white/40">%</span></p>
              <div className="mt-3">
                <span className={cn("inline-block text-xs font-bold px-3 py-1 rounded-md border", entitleStyle)}>
                  {entitlement}
                </span>
              </div>
              <p className="text-[10px] text-white/20 mt-2 font-helvetica">avg of all 6 KPIs · updates live</p>
            </div>

            <div className="bg-black/20 border border-white/06 rounded-lg p-4">
              <p className="font-orbitron text-[9px] text-white/30 uppercase tracking-widest mb-3">Breakdown</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-helvetica">
                {kpiKeys.map((k) => {
                  const isLocked = KPI_LOCKED[k];
                  const value    = isLocked ? locked[k as "taskCompletionRate" | "ticketResolutionRate"] : manual[k as keyof typeof manual];
                  return (
                    <div key={k} className="flex justify-between">
                      <span className="text-white/40 truncate mr-2">{KPI_LABELS[k].split(" ")[0]}</span>
                      <span className={isLocked ? "text-blue-400 font-bold" : "text-white font-bold"}>{value}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1">
              <label className="field-label">Comments (optional)</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                placeholder="Key achievements, areas for improvement, goals for next period…"
                className="input-field resize-none w-full text-sm"
              />
            </div>

            {error && <p className="text-xs text-red-400 font-helvetica">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 border border-white/10 text-white/40 hover:text-white rounded-lg py-2.5 text-sm font-helvetica transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || computing || !empUid}
                className="flex-2 btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save Review"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
