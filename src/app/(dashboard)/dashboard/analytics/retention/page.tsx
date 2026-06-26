"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRetentionAnalytics, EMPTY_RETENTION, LOW_SAMPLE_THRESHOLD, type RetentionData } from "@/lib/analytics-service";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

function Spinner() {
  return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
}

function BarChart({ data, format }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="w-32 text-xs text-white/50 font-helvetica text-right truncate shrink-0">{item.label}</div>
          <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
            <div className="h-full bg-secondary/60 rounded transition-all" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <div className="w-24 text-xs text-white font-helvetica text-right shrink-0">
            {format ? format(item.value) : item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ClientRetentionPage() {
  const [data, setData]         = useState<RetentionData>(EMPTY_RETENTION);
  const [loading, setLoading]   = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getRetentionAnalytics()
      .then(setData)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const d = data;
  const clientsDenied  = d.deniedSources.includes("clients");
  const leadsDenied    = d.deniedSources.includes("leads");
  const invoicesDenied = d.deniedSources.includes("invoices");
  const retentionRateDenied = clientsDenied || leadsDenied; // its denominator mixes both sources
  const lowRetentionSample  = d.retentionSampleSize < LOW_SAMPLE_THRESHOLD;

  return (
    <div className="animate-fade-in space-y-6">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="text-red-400">⚠</span>
          <p className="text-red-400 text-sm font-helvetica">Could not load retention data. Check Firestore access.</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Clients",   value: String(d.activeClients),       accent: "text-emerald-400", denied: clientsDenied, low: false },
          { label: "Retained Clients", value: String(d.retainedLeads),       accent: "text-purple-400", denied: leadsDenied, low: false },
          { label: "Retention Rate",   value: lowRetentionSample ? `${d.retentionRate}% (${d.retainedLeads} of ${d.retentionSampleSize})` : `${d.retentionRate}%`,
            accent: lowRetentionSample ? "text-white/50" : (d.retentionRate >= 70 ? "text-emerald-400" : d.retentionRate >= 40 ? "text-amber-400" : "text-white/50"),
            denied: retentionRateDenied, low: lowRetentionSample },
          { label: "Avg Client Value", value: formatNaira(d.avgClientValue), accent: "text-secondary", denied: clientsDenied || invoicesDenied, low: false },
        ].map((item) => (
          <div key={item.label} className="surface-card p-5 min-h-[90px]">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{item.label}</p>
            {item.denied ? (
              <p className="text-white/30 text-xs font-helvetica leading-snug mt-2">🔒 You don&apos;t have access to this data.</p>
            ) : (
              <>
                <p className={cn("font-orbitron text-2xl font-bold tabular-nums", item.accent)}>{item.value}</p>
                {item.low && <p className="text-[10px] text-white/30 font-helvetica mt-1">Low sample size — not statistically meaningful yet.</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Empty state when no clients at all */}
      {!clientsDenied && !leadsDenied && d.activeClients === 0 && d.retainedLeads === 0 && (
        <div className="surface-card px-6 py-12 text-center">
          <p className="text-white/20 text-sm font-helvetica mb-3">No clients yet — retention data will appear once you have clients.</p>
          <Link href="/dashboard/crm/leads/new" className="text-accent text-sm font-helvetica hover:underline">Add first lead →</Link>
        </div>
      )}

      {/* Retention overview */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">Retention Overview</h2>
        {retentionRateDenied ? (
          <p className="text-white/30 text-sm font-helvetica text-center py-8">🔒 You don&apos;t have access to client/lead data.</p>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Donut */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                <circle cx="50" cy="50" r="40" fill="none"
                  stroke={d.retentionRate >= 70 ? "#34d399" : d.retentionRate >= 40 ? "#fbbf24" : "#f87171"}
                  strokeWidth="12"
                  strokeDasharray={`${d.retentionRate * 2.51} 251`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-orbitron text-xl font-bold text-white">{d.retentionRate}%</span>
              </div>
            </div>
            <p className="text-xs text-white/40 font-helvetica mt-2">Retention Rate</p>
          </div>
          {/* Bars */}
          <div className="space-y-4 flex flex-col justify-center">
            {[
              { label: "Active",   value: d.activeClients,  color: "bg-emerald-500/60" },
              { label: "Retained", value: d.retainedLeads,  color: "bg-purple-500/60" },
            ].map((item) => {
              const total = d.activeClients + d.retainedLeads;
              return (
                <div key={item.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-white/50 font-helvetica">{item.label}</span>
                    <span className="text-xs text-white font-helvetica font-semibold">{item.value}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", item.color)} style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Avg value card */}
          <div className="flex flex-col justify-center gap-3">
            <div className="surface-card p-4 bg-white/[0.03]">
              <p className="text-xs text-white/40 font-helvetica">Avg Lifetime Value</p>
              {clientsDenied || invoicesDenied ? (
                <p className="text-white/30 text-xs font-helvetica mt-1">🔒 No access</p>
              ) : (
                <p className="font-orbitron text-lg font-bold text-secondary">{formatNaira(d.avgClientValue)}</p>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* New clients by month */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">New Clients per Month</h2>
        {clientsDenied ? (
          <p className="text-white/30 text-sm font-helvetica text-center py-8">🔒 You don&apos;t have access to client data.</p>
        ) : (
        <div className="flex items-end gap-2 h-32">
          {d.clientsByMonth.map((m) => {
            const max = Math.max(...d.clientsByMonth.map((x) => x.count), 1);
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                {m.count > 0 && <p className="text-[10px] text-white/40 font-helvetica">{m.count}</p>}
                <div className="w-full bg-white/5 rounded-t" style={{ height: "80px" }}>
                  <div className="w-full bg-emerald-500/60 rounded-t transition-all" style={{ height: `${(m.count / max) * 100}%`, marginTop: `${80 - (m.count / max) * 80}px` }} />
                </div>
                <p className="text-[10px] text-white/40 font-helvetica">{m.label}</p>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Top clients */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Client Lifetime Value (Top 8)</h2>
        {invoicesDenied ? (
          <p className="text-white/30 text-sm font-helvetica text-center py-8">🔒 You don&apos;t have access to invoice data.</p>
        ) : d.topClientsByValue.length === 0 ? (
          <p className="text-white/20 text-sm font-helvetica text-center py-8">No payment data yet.</p>
        ) : (
          <BarChart data={d.topClientsByValue.map((c) => ({ label: c.name, value: c.value }))} format={formatNaira} />
        )}
      </div>
    </div>
  );
}
