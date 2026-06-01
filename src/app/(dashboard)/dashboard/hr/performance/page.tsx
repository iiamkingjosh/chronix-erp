"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { getEmployees } from "@/lib/hr-service";
import { MONTHS, ENTITLEMENT_STYLES, calcEntitlement } from "@/types/hr";
import type { Employee, PerformanceReview } from "@/types/hr";
import { cn } from "@/lib/utils";
import CreateReviewModal from "@/components/performance/CreateReviewModal";

function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function generatePeriods(): string[] {
  const result: string[] = [];
  let m = 5, y = 2026;
  const now = new Date();
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return result.reverse();
}

function getTrend(empUid: string, reviews: PerformanceReview[]): "up" | "down" | "flat" {
  const sorted = reviews
    .filter((r) => r.employeeId === empUid)
    .sort((a, b) => b.reviewPeriod.localeCompare(a.reviewPeriod));
  if (sorted.length < 2) return "flat";
  if (sorted[0].overallScore > sorted[1].overallScore) return "up";
  if (sorted[0].overallScore < sorted[1].overallScore) return "down";
  return "flat";
}

export default function PerformancePage() {
  const { profile }   = useAuth();
  const router        = useRouter();
  const canManage     = profile
    ? hasPermission(profile.role, "manage:hr") || hasPermission(profile.role, "view:all")
    : false;

  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [reviews,     setReviews]     = useState<PerformanceReview[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [modalEmpUid, setModalEmpUid] = useState<string | undefined>(undefined);

  const periods = useMemo(() => generatePeriods(), []);
  const [filterPeriod, setFilterPeriod] = useState(periods[0] ?? "");
  const [filterDept,   setFilterDept]   = useState("all");
  const [filterScore,  setFilterScore]  = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [emps, snap] = await Promise.all([
        getEmployees(),
        getDocs(query(collection(db, "performance_reviews"), orderBy("reviewPeriod", "desc"))),
      ]);
      if (cancelled) return;
      setEmployees(emps);
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PerformanceReview)));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const periodReviews = useMemo(
    () => reviews.filter((r) => r.reviewPeriod === filterPeriod),
    [reviews, filterPeriod]
  );

  const periodReviewMap = useMemo(() => {
    const map = new Map<string, PerformanceReview>();
    periodReviews.forEach((r) => map.set(r.employeeId, r));
    return map;
  }, [periodReviews]);

  const departments = useMemo(
    () => ["all", ...Array.from(new Set(employees.map((e) => e.department).filter(Boolean)))],
    [employees]
  );

  const filtered = useMemo(() => {
    return employees.filter((emp) => {
      if (filterDept !== "all" && emp.department !== filterDept) return false;
      const rev = periodReviewMap.get(emp.uid);
      if (filterScore === "exceptional" && (!rev || rev.overallScore < 90)) return false;
      if (filterScore === "above"       && (!rev || rev.overallScore < 75)) return false;
      if (filterScore === "attention"   && (!rev || rev.overallScore >= 60)) return false;
      return true;
    });
  }, [employees, filterDept, filterScore, periodReviewMap]);

  const avgScore = periodReviews.length
    ? Math.round(periodReviews.reduce((s, r) => s + r.overallScore, 0) / periodReviews.length)
    : null;
  const topCount      = periodReviews.filter((r) => r.overallScore >= 90).length;
  const attentionCount = periodReviews.filter((r) => r.overallScore < 60).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
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

  return (
    <div className="animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Reviewed",
            value: String(periodReviews.length),
            sub:   periodLabel(filterPeriod),
            color: "text-white",
          },
          {
            label: "Avg Score",
            value: avgScore != null ? `${avgScore}%` : "—",
            sub:   avgScore != null ? calcEntitlement(avgScore) : "no data",
            color: avgScore != null
              ? avgScore >= 75 ? "text-emerald-400" : avgScore >= 60 ? "text-amber-400" : "text-red-400"
              : "text-white/30",
          },
          {
            label: "Top Performers",
            value: String(topCount),
            sub:   "≥ 90% Exceptional",
            color: "text-emerald-400",
          },
          {
            label: "Needs Attention",
            value: String(attentionCount),
            sub:   "below 60%",
            color: attentionCount > 0 ? "text-red-400" : "text-white/40",
          },
        ].map((c) => (
          <div key={c.label} className="surface-card p-5">
            <p className="font-orbitron text-[10px] text-white/30 uppercase tracking-widest mb-2">{c.label}</p>
            <p className={cn("text-2xl font-black", c.color)}>{c.value}</p>
            <p className="text-xs text-white/30 font-helvetica mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="input-field py-2 w-40"
        >
          {periods.map((p) => (
            <option key={p} value={p} className="bg-primary-dark">{periodLabel(p)}</option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="input-field py-2 w-44"
        >
          {departments.map((d) => (
            <option key={d} value={d} className="bg-primary-dark">
              {d === "all" ? "All Departments" : d}
            </option>
          ))}
        </select>
        <select
          value={filterScore}
          onChange={(e) => setFilterScore(e.target.value)}
          className="input-field py-2 w-44"
        >
          <option value="all"         className="bg-primary-dark">All Scores</option>
          <option value="exceptional" className="bg-primary-dark">≥ 90% Exceptional</option>
          <option value="above"       className="bg-primary-dark">≥ 75% Above Target</option>
          <option value="attention"   className="bg-primary-dark">Below 60%</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={() => { setModalEmpUid(undefined); setShowModal(true); }}
          className="btn-primary"
        >
          + Create Review
        </button>
      </div>

      {/* Staff table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/08">
                {["Employee", "Department", "Score", "Entitlement", "Trend", "Period", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-orbitron text-[10px] text-white/30 uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const rev   = periodReviewMap.get(emp.uid);
                const trend = getTrend(emp.uid, reviews);
                const isRed = rev && rev.overallScore < 60;
                return (
                  <tr
                    key={emp.uid}
                    className={cn(
                      "border-b border-white/04 transition-colors cursor-pointer",
                      isRed ? "bg-red-500/05 hover:bg-red-500/10" : "hover:bg-white/03"
                    )}
                    onClick={() => router.push(`/dashboard/hr/performance/${emp.uid}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-xs font-bold text-secondary shrink-0">
                          {emp.fullName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-semibold font-helvetica">{emp.fullName}</p>
                          <p className="text-white/30 text-xs font-helvetica">{emp.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/40 font-helvetica">{emp.department || "—"}</td>
                    <td className="px-4 py-3">
                      {rev ? (
                        <span className={cn(
                          "text-base font-black",
                          rev.overallScore >= 90 ? "text-emerald-400"
                            : rev.overallScore >= 75 ? "text-blue-400"
                            : rev.overallScore >= 60 ? "text-amber-400"
                            : "text-red-400"
                        )}>
                          {rev.overallScore}%
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rev ? (
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded border",
                          ENTITLEMENT_STYLES[rev.entitlement]
                        )}>
                          {rev.entitlement}
                        </span>
                      ) : (
                        <span className="text-xs text-white/20 border border-white/08 px-2 py-0.5 rounded font-helvetica">
                          Not reviewed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={
                        trend === "up" ? "text-emerald-400"
                          : trend === "down" ? "text-red-400"
                          : "text-white/30"
                      }>
                        {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/30 font-helvetica text-xs">
                      {rev ? periodLabel(rev.reviewPeriod) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {rev ? (
                        <button
                          onClick={() => router.push(`/dashboard/hr/performance/${emp.uid}`)}
                          className="text-xs border border-white/10 text-white/40 hover:text-white px-3 py-1 rounded transition-colors"
                        >
                          View
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalEmpUid(emp.uid);
                            setShowModal(true);
                          }}
                          className="text-xs border border-accent/30 text-accent hover:bg-accent/10 px-3 py-1 rounded transition-colors"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-white/20 font-helvetica">
                    No employees match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <CreateReviewModal
          employees={employees}
          defaultEmpUid={modalEmpUid}
          existingReviews={reviews}
          onSaved={(r) => setReviews((prev) => [r, ...prev])}
          onClose={() => { setShowModal(false); setModalEmpUid(undefined); }}
        />
      )}
    </div>
  );
}
