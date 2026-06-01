"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { MONTHS, ENTITLEMENT_STYLES, KPI_LABELS, KPI_LOCKED } from "@/types/hr";
import type { PerformanceReview, KPIScores } from "@/types/hr";
import { cn } from "@/lib/utils";

function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

const KPI_KEYS = Object.keys(KPI_LABELS) as Array<keyof KPIScores>;

export default function MyPerformancePage() {
  const { profile } = useAuth();

  const [reviews,  setReviews]  = useState<PerformanceReview[]>([]);
  const [selected, setSelected] = useState<PerformanceReview | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    async function load() {
      const snap = await getDocs(
        query(
          collection(db, "performance_reviews"),
          where("employeeId", "==", profile!.uid),
          orderBy("reviewPeriod", "desc")
        )
      );
      if (cancelled) return;
      const revs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PerformanceReview));
      setReviews(revs);
      setSelected(revs[0] ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.uid]);

  const latest   = reviews[0] ?? null;
  const avgScore = useMemo(() => {
    const slice = reviews.slice(0, 3);
    if (!slice.length) return null;
    return Math.round(slice.reduce((s, r) => s + r.overallScore, 0) / slice.length);
  }, [reviews]);
  const trend = useMemo(() => {
    if (reviews.length < 2) return null;
    return reviews[0].overallScore > reviews[1].overallScore ? "up" as const
      : reviews[0].overallScore < reviews[1].overallScore ? "down" as const
      : "flat" as const;
  }, [reviews]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-5">
          <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-2">Latest Score</p>
          {latest ? (
            <>
              <p className={cn(
                "text-3xl font-black",
                latest.overallScore >= 90 ? "text-emerald-400"
                  : latest.overallScore >= 75 ? "text-blue-400"
                  : latest.overallScore >= 60 ? "text-amber-400"
                  : "text-red-400"
              )}>
                {latest.overallScore}%
              </p>
              <span className={cn(
                "inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded border",
                ENTITLEMENT_STYLES[latest.entitlement]
              )}>
                {latest.entitlement}
              </span>
            </>
          ) : (
            <p className="text-2xl font-black text-white/20">—</p>
          )}
        </div>
        <div className="surface-card p-5">
          <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-2">3-Month Avg</p>
          <p className={cn("text-3xl font-black", avgScore != null ? "text-blue-400" : "text-white/20")}>
            {avgScore != null ? `${avgScore}%` : "—"}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-2">Trend</p>
          <p className={cn(
            "text-3xl font-black",
            trend === "up" ? "text-emerald-400"
              : trend === "down" ? "text-red-400"
              : "text-white/30"
          )}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "—"}
          </p>
          {trend && (
            <p className="text-xs text-white/30 font-helvetica mt-1">
              {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
            </p>
          )}
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="surface-card px-5 py-20 text-center">
          <p className="text-white/20 font-helvetica">
            No performance reviews yet. Your HR team will add them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: review list */}
          <div className="space-y-3">
            <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest">Review History</p>
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
                <div className="flex items-center justify-between mb-2">
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
                <div className="h-1 bg-white/06 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      r.overallScore >= 90 ? "bg-emerald-500/60"
                        : r.overallScore >= 75 ? "bg-blue-500/60"
                        : r.overallScore >= 60 ? "bg-amber-500/60"
                        : "bg-red-500/60"
                    )}
                    style={{ width: `${r.overallScore}%` }}
                  />
                </div>
              </button>
            ))}
          </div>

          {/* Right: KPI breakdown (read-only) */}
          <div>
            {selected && (
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

                <div className="flex items-center gap-2 bg-white/03 rounded-lg px-3 py-2">
                  <span className="text-white/20 text-sm">🔒</span>
                  <span className="text-xs text-white/20 font-helvetica">
                    Your reviews are managed by HR and are read-only.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
