"use client";

import { useEffect, useState } from "react";
import { getServiceAnalytics, EMPTY_SERVICE, type ServiceData } from "@/lib/analytics-service";
import { PRIORITY_LABELS, STATUS_LABELS, PRIORITY_STYLES, STATUS_STYLES } from "@/types/tickets";
import { cn } from "@/lib/utils";

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
}

function BarChart({ data, colorFn }: { data: { label: string; value: number }[]; colorFn?: (l: string) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="w-28 text-xs text-white/50 font-helvetica text-right truncate shrink-0">{item.label}</div>
          <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
            <div className={cn("h-full rounded transition-all", colorFn ? colorFn(item.label) : "bg-accent/60")} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <div className="w-10 text-xs text-white font-helvetica text-right shrink-0">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function ServiceAnalyticsPage() {
  const [data, setData]         = useState<ServiceData>(EMPTY_SERVICE);
  const [loading, setLoading]   = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getServiceAnalytics()
      .then(setData)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const d = data;

  const priorityBarData = d.ticketsByPriority.map((p) => ({
    label: PRIORITY_LABELS[p.priority as keyof typeof PRIORITY_LABELS] ?? p.priority,
    value: p.count,
    raw:   p.priority,
  }));

  const statusBarData = d.ticketsByStatus.map((s) => ({
    label: STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status,
    value: s.count,
    raw:   s.status,
  }));

  return (
    <div className="animate-fade-in space-y-6">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="text-red-400">⚠</span>
          <p className="text-red-400 text-sm font-helvetica">Could not load service data. Check Firestore access.</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Avg Resolution Time", value: `${d.avgResolutionHours}h`,  accent: d.avgResolutionHours > 0 && d.avgResolutionHours <= 24 ? "text-emerald-400" : d.avgResolutionHours > 24 ? "text-amber-400" : "text-white/50" },
          { label: "SLA Breach Rate",     value: `${d.slaBreachRate}%`,       accent: d.slaBreachRate > 20 ? "text-red-400" : d.slaBreachRate > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Total Resolved",      value: String(d.totalResolved),     accent: "text-emerald-400" },
          { label: "Currently Breached",  value: String(d.totalBreached),     accent: d.totalBreached > 0 ? "text-red-400" : "text-white/50" },
        ].map((item) => (
          <div key={item.label} className="surface-card p-5 min-h-[90px]">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{item.label}</p>
            <p className={cn("font-orbitron text-2xl font-bold tabular-nums", item.accent)}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Tickets by Priority</h2>
          {priorityBarData.length === 0 ? (
            <p className="text-white/20 text-sm font-helvetica text-center py-8">No tickets yet. Create a ticket to see this chart.</p>
          ) : (
            <BarChart data={priorityBarData} colorFn={(label) => {
              const item = priorityBarData.find((p) => p.label === label);
              const style = PRIORITY_STYLES[item?.raw as keyof typeof PRIORITY_STYLES] ?? "";
              if (style.includes("red")) return "bg-red-500/50";
              if (style.includes("accent")) return "bg-accent/60";
              if (style.includes("secondary")) return "bg-secondary/60";
              return "bg-white/20";
            }} />
          )}
        </div>

        <div className="surface-card p-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Tickets by Status</h2>
          {statusBarData.length === 0 ? (
            <p className="text-white/20 text-sm font-helvetica text-center py-8">No tickets yet. Create a ticket to see this chart.</p>
          ) : (
            <BarChart data={statusBarData} colorFn={(label) => {
              const item = statusBarData.find((s) => s.label === label);
              const style = STATUS_STYLES[item?.raw as keyof typeof STATUS_STYLES] ?? "";
              if (style.includes("blue"))    return "bg-blue-500/50";
              if (style.includes("amber"))   return "bg-amber-500/50";
              if (style.includes("emerald")) return "bg-emerald-500/50";
              return "bg-white/20";
            }} />
          )}
        </div>
      </div>

      {/* Top Issues */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Top Issues Log</h2>
        {d.topIssues.length === 0 ? (
          <p className="text-white/20 text-sm font-helvetica text-center py-8">No ticket data yet.</p>
        ) : (
          <div className="space-y-2">
            {d.topIssues.map((issue, i) => (
              <div key={issue.title} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-white/40 font-orbitron shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm text-white font-helvetica truncate">{issue.title}</span>
                <span className="text-xs text-white/40 font-helvetica shrink-0">{issue.count} ticket{issue.count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
