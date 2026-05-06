"use client";

import { useEffect, useState } from "react";
import { getTeamAnalytics, EMPTY_TEAM, type TeamData } from "@/lib/analytics-service";
import { cn } from "@/lib/utils";

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
}

function BarChart({ data, color }: { data: { name: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <div className="w-32 text-xs text-white/50 font-helvetica text-right truncate shrink-0">{item.name}</div>
          <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
            <div className={cn("h-full rounded transition-all", color)} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <div className="w-8 text-xs text-white font-helvetica text-right shrink-0">{item.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function TeamProductivityPage() {
  const [data, setData]         = useState<TeamData>(EMPTY_TEAM);
  const [loading, setLoading]   = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getTeamAnalytics()
      .then(setData)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const d = data;
  const totalActive = d.projectsOnTrack + d.projectsDelayed;
  const trackPct    = totalActive > 0 ? Math.round((d.projectsOnTrack / totalActive) * 100) : 100;

  return (
    <div className="animate-fade-in space-y-6">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="text-red-400">⚠</span>
          <p className="text-red-400 text-sm font-helvetica">Could not load team data. Check Firestore access.</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="surface-card p-5 text-center min-h-[90px]">
          <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">Projects On Track</p>
          <p className="font-orbitron text-3xl font-bold text-emerald-400 tabular-nums">{d.projectsOnTrack}</p>
          <p className="text-xs text-white/30 font-helvetica mt-1">of {totalActive} active</p>
        </div>
        <div className="surface-card p-5 text-center min-h-[90px]">
          <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">Delayed Projects</p>
          <p className={cn("font-orbitron text-3xl font-bold tabular-nums", d.projectsDelayed > 0 ? "text-red-400" : "text-white/40")}>
            {d.projectsDelayed}
          </p>
        </div>
        <div className="surface-card p-5 text-center min-h-[90px]">
          <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">On-Time Rate</p>
          <p className={cn("font-orbitron text-3xl font-bold tabular-nums", trackPct >= 80 ? "text-emerald-400" : trackPct >= 60 ? "text-amber-400" : "text-red-400")}>
            {trackPct}%
          </p>
        </div>
      </div>

      {/* Project health bar */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">Project Health</h2>
        {d.totalProjects === 0 ? (
          <p className="text-white/20 text-sm font-helvetica text-center py-4">No projects yet.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                <span className="text-xs text-white/50 font-helvetica">On Track ({d.projectsOnTrack})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="text-xs text-white/50 font-helvetica">Delayed ({d.projectsDelayed})</span>
              </div>
            </div>
            <div className="h-4 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/60 rounded-full transition-all" style={{ width: `${trackPct}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Tasks Completed per Staff</h2>
          {d.tasksCompleted.length === 0 ? (
            <p className="text-white/20 text-sm font-helvetica text-center py-8">No completed tasks yet.</p>
          ) : (
            <BarChart data={d.tasksCompleted} color="bg-emerald-500/50" />
          )}
        </div>
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Open Tickets per Staff</h2>
          {d.openTicketsPerStaff.length === 0 ? (
            <p className="text-white/20 text-sm font-helvetica text-center py-8">No open tickets.</p>
          ) : (
            <BarChart data={d.openTicketsPerStaff} color="bg-accent/50" />
          )}
        </div>
      </div>
    </div>
  );
}
