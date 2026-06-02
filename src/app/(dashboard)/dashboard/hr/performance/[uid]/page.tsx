"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { getEmployee } from "@/lib/hr-service";
import { MONTHS, ENTITLEMENT_STYLES, KPI_LABELS, KPI_LOCKED } from "@/types/hr";
import type { Employee, PerformanceReview, KPIScores } from "@/types/hr";
import { cn } from "@/lib/utils";
import CreateReviewModal from "@/components/performance/CreateReviewModal";

function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function calc3MonthAvg(revs: PerformanceReview[]): number | null {
  const slice = revs.slice(0, 3);
  if (!slice.length) return null;
  return Math.round(slice.reduce((s, r) => s + r.overallScore, 0) / slice.length);
}

function last6Periods(): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return result;
}

const KPI_KEYS = Object.keys(KPI_LABELS) as Array<keyof KPIScores>;

export default function IndividualPerformancePage() {
  const { profile } = useAuth();
  const params      = useParams<{ uid: string }>();
  const uid         = params.uid;
  const canManage   = profile
    ? hasPermission(profile.role, "manage:hr") || hasPermission(profile.role, "view:all")
    : false;

  const [employee,  setEmployee]  = useState<Employee | null>(null);
  const [reviews,   setReviews]   = useState<PerformanceReview[]>([]);
  const [selected,  setSelected]  = useState<PerformanceReview | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function load() {
      const [emp, snap] = await Promise.all([
        getEmployee(uid),
        getDocs(
          query(
            collection(db, "performance_reviews"),
            where("employeeId", "==", uid),
            orderBy("reviewPeriod", "desc")
          )
        ),
      ]);
      if (cancelled) return;
      setEmployee(emp);
      const revs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PerformanceReview));
      setReviews(revs);
      setSelected(revs[0] ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [uid]);

  const avgScore = useMemo(() => calc3MonthAvg(reviews), [reviews]);
  const trend = useMemo(() => {
    if (reviews.length < 2) return "flat" as const;
    return reviews[0].overallScore > reviews[1].overallScore ? "up" as const
      : reviews[0].overallScore < reviews[1].overallScore ? "down" as const
      : "flat" as const;
  }, [reviews]);

  const chartPeriods = useMemo(() => last6Periods(), []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">Access restricted to HR managers.</p>
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">Employee not found.</p>
      </div>
    );
  }

  const latestScore       = reviews[0]?.overallScore ?? null;
  const latestEntitlement = reviews[0]?.entitlement  ?? null;

  return (
    <div className="animate-fade-in">
      <Link
        href="/dashboard/hr/performance"
        className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white font-helvetica transition-colors mb-5"
      >
        ← Back to Performance Dashboard
      </Link>

      {/* Employee header */}
      <div className="surface-card p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-secondary/20 border-2 border-secondary/30 flex items-center justify-center text-lg font-black text-secondary">
            {employee.fullName[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="font-orbitron text-base font-bold text-white">{employee.fullName}</h2>
            <p className="text-xs text-white/40 font-helvetica mt-0.5">
              {employee.role} · {employee.department || "—"}
              {employee.employeeNumber ? ` · ${employee.employeeNumber}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {latestScore != null && latestEntitlement && (
            <div className="text-center px-4 py-2 bg-black/30 border border-white/08 rounded-lg">
              <p className="font-orbitron text-[9px] text-white/30 uppercase tracking-widest">Latest</p>
              <p className={cn(
                "text-xl font-black",
                latestScore >= 90 ? "text-emerald-400"
                  : latestScore >= 75 ? "text-blue-400"
                  : latestScore >= 60 ? "text-amber-400"
                  : "text-red-400"
              )}>
                {latestScore}%
              </p>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", ENTITLEMENT_STYLES[latestEntitlement])}>
                {latestEntitlement}
              </span>
            </div>
          )}
          {avgScore != null && (
            <div className="text-center px-4 py-2 bg-black/30 border border-white/08 rounded-lg">
              <p className="font-orbitron text-[9px] text-white/30 uppercase tracking-widest">3-Month Avg</p>
              <p className="text-xl font-black text-blue-400">{avgScore}%</p>
            </div>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
            + New Review
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: chart + history */}
        <div className="space-y-5">
          {/* Bar chart */}
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-4">
              Monthly Score Trend
            </p>
            <div className="flex items-end gap-2 h-24">
              {chartPeriods.map((p) => {
                const rev  = reviews.find((r) => r.reviewPeriod === p);
                const pct  = rev?.overallScore ?? 0;
                const barH = rev ? `${Math.max(8, pct)}%` : "6px";
                const color = !rev ? "bg-white/08"
                  : pct >= 90 ? "bg-emerald-500/70"
                  : pct >= 75 ? "bg-blue-500/70"
                  : pct >= 60 ? "bg-amber-500/70"
                  : "bg-red-500/70";
                return (
                  <div key={p} className="flex flex-col items-center gap-1 flex-1">
                    {rev && (
                      <span className="text-[10px] font-bold text-white/60">{pct}%</span>
                    )}
                    <div className="w-full flex items-end justify-center flex-1">
                      <div
                        className={cn("w-full rounded-t transition-all", color)}
                        style={{ height: barH }}
                        title={rev ? `${periodLabel(p)}: ${pct}%` : `${periodLabel(p)}: no review`}
                      />
                    </div>
                    <span className="text-[9px] text-white/30 font-helvetica">
                      {MONTHS[parseInt(p.split("-")[1], 10) - 1]?.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Review history */}
          <div className="space-y-3">
            <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest">
              Review History ({reviews.length})
            </p>
            {reviews.length === 0 && (
              <div className="surface-card px-5 py-10 text-center">
                <p className="text-white/20 text-sm font-helvetica">No reviews yet.</p>
              </div>
            )}
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={cn(
                  "w-full surface-card p-4 text-left transition-all",
                  selected?.id === r.id
                    ? "border-accent/40 bg-accent/05"
                    : "hover:border-white/15"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white font-helvetica">
                    {periodLabel(r.reviewPeriod)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-lg font-black",
                      r.overallScore >= 90 ? "text-emerald-400"
                        : r.overallScore >= 75 ? "text-blue-400"
                        : r.overallScore >= 60 ? "text-amber-400"
                        : "text-red-400"
                    )}>
                      {r.overallScore}%
                    </span>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded border",
                      ENTITLEMENT_STYLES[r.entitlement]
                    )}>
                      {r.entitlement}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-white/30 font-helvetica mt-1">
                  Reviewed by {r.createdByName}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: KPI breakdown */}
        <div>
          {selected ? (
            <div className="surface-card p-5 space-y-4 sticky top-6">
              <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest">
                KPI Breakdown — {periodLabel(selected.reviewPeriod)}
              </p>

              {KPI_KEYS.map((k) => {
                const val      = selected.kpiScores[k];
                const isLocked = KPI_LOCKED[k];
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60 font-helvetica">{KPI_LABELS[k]}</span>
                        {isLocked && (
                          <span className="text-[9px] bg-blue-500/12 text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5">
                            AUTO
                          </span>
                        )}
                      </div>
                      <span className={cn("text-sm font-bold", isLocked ? "text-blue-400" : "text-accent")}>
                        {val}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/06 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", isLocked ? "bg-blue-500/70" : "bg-accent/80")}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-3 border-t border-white/08">
                <span className="font-orbitron text-xs font-bold text-white">Overall Score</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xl font-black",
                    selected.overallScore >= 90 ? "text-emerald-400"
                      : selected.overallScore >= 75 ? "text-blue-400"
                      : selected.overallScore >= 60 ? "text-amber-400"
                      : "text-red-400"
                  )}>
                    {selected.overallScore}%
                  </span>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded border",
                    ENTITLEMENT_STYLES[selected.entitlement]
                  )}>
                    {selected.entitlement}
                  </span>
                </div>
              </div>

              {selected.comments && (
                <div className="bg-black/20 border border-white/06 rounded-lg p-4">
                  <p className="font-orbitron text-[9px] text-white/30 uppercase tracking-widest mb-2">
                    Comments
                  </p>
                  <p className="text-sm text-white/50 font-helvetica leading-relaxed">
                    {selected.comments}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="surface-card p-10 text-center">
              <p className="text-white/20 text-sm font-helvetica">
                Select a review from the history to see the KPI breakdown.
              </p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <CreateReviewModal
          employees={[employee]}
          defaultEmpUid={uid}
          existingReviews={reviews}
          onSaved={(r) => {
            setReviews((prev) => [r, ...prev]);
            setSelected(r);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
