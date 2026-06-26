"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMasterDashboard, EMPTY_MASTER, type MasterDashboardData, type AnalyticsSource } from "@/lib/analytics-service";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up  = pct >= 0;
  return (
    <span className={cn("text-xs font-helvetica ml-1", up ? "text-emerald-400" : "text-red-400")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs last month
    </span>
  );
}

/** denied !== empty: a rule-rejected source must look visibly different
 * from a genuinely empty one, not silently render as "0". */
function MetricCard({ label, value, sub, accent = "text-white", icon, href, denied }: {
  label: string; value: string | number; sub?: React.ReactNode; accent?: string; icon: string; href?: string; denied?: boolean;
}) {
  const inner = (
    <div className="surface-card p-5 flex flex-col gap-2 min-h-[100px] hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider">{label}</p>
        <span className="text-xl leading-none">{denied ? "🔒" : icon}</span>
      </div>
      {denied ? (
        <p className="text-white/30 text-xs font-helvetica leading-snug">You don&apos;t have access to this data.</p>
      ) : (
        <>
          <p className={cn("font-orbitron text-2xl font-bold leading-none tabular-nums", accent)}>
            {value === "" || value === undefined || value === null ? "—" : value}
          </p>
          {sub && <div className="mt-1">{sub}</div>}
        </>
      )}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

/** Same denied/empty distinction, for a single row inside a mixed-source
 * summary panel rather than a full card. */
function PanelRow({ k, v, c, denied }: { k: string; v: string; c: string; denied: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-white/50 font-helvetica">{k}</span>
      {denied
        ? <span className="text-[10px] text-white/30 font-helvetica">🔒 no access</span>
        : <span className={cn("text-xs font-semibold font-helvetica", c)}>{v}</span>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function CommandCentrePage() {
  const [data, setData]       = useState<MasterDashboardData>(EMPTY_MASTER);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getMasterDashboard()
      .then(setData)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const d = data;
  const denied = (s: AnalyticsSource) => d.deniedSources.includes(s);

  return (
    <div className="animate-fade-in space-y-6">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="text-red-400">⚠</span>
          <p className="text-red-400 text-sm font-helvetica">Some metrics failed to load. Values shown may be incomplete.</p>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Revenue This Month"     value={formatNaira(d.revenueThisMonth)}    icon="💰" accent="text-secondary"                                         href="/dashboard/finance/invoices" denied={denied("invoices")}
          sub={<Trend current={d.revenueThisMonth} previous={d.revenueLastMonth} />} />
        <MetricCard label="Outstanding Invoices"   value={formatNaira(d.outstandingInvoices)}  icon="📄" accent={d.outstandingInvoices > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/finance/invoices" denied={denied("invoices")} />
        <MetricCard label="Active Clients"         value={d.activeClientsCount}                icon="🏢" accent="text-emerald-400"                                       href="/dashboard/crm/clients" denied={denied("clients")} />
        <MetricCard label="Open Tickets"           value={d.openTicketsCount}                  icon="🎫" accent={d.openTicketsCount > 5 ? "text-accent" : "text-white"}  href="/dashboard/tickets" denied={denied("tickets")} />
        <MetricCard label="Expiring Subscriptions" value={d.expiringSubsCount}                 icon="🔔" accent={d.expiringSubsCount > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/subscriptions" denied={denied("subscriptions")}
          sub={d.expiringSubsCount > 0 ? <span className="text-xs text-amber-400/70 font-helvetica">within 60 days</span> : undefined} />
        <MetricCard label="Active Projects"        value={d.activeProjectsCount}               icon="📋" accent="text-secondary"                                         href="/dashboard/projects" denied={denied("projects")} />
        <MetricCard label="Team Headcount"         value={d.teamHeadcount}                     icon="👥" accent="text-white" denied={denied("users")} />
        <MetricCard label="Last Month Revenue"     value={formatNaira(d.revenueLastMonth)}     icon="📅" accent="text-white/50" denied={denied("invoices")} />
      </div>

      {/* Revenue comparison */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-6">Revenue Comparison</h2>
        {denied("invoices") ? (
          <div className="py-8 text-center">
            <p className="text-white/30 text-sm font-helvetica">🔒 You don&apos;t have access to invoice data.</p>
          </div>
        ) : d.revenueThisMonth === 0 && d.revenueLastMonth === 0 ? (
          <div className="py-8 text-center">
            <p className="text-white/20 text-sm font-helvetica">No revenue data yet.</p>
            <Link href="/dashboard/finance/invoices/new" className="mt-2 inline-block text-accent text-sm font-helvetica hover:underline">
              Create your first invoice →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {[
              { label: "This Month", value: d.revenueThisMonth, color: "bg-secondary" },
              { label: "Last Month", value: d.revenueLastMonth, color: "bg-white/20" },
            ].map((item) => {
              const maxVal = Math.max(d.revenueThisMonth, d.revenueLastMonth, 1);
              return (
                <div key={item.label}>
                  <p className="text-xs text-white/40 font-helvetica mb-2">{item.label}</p>
                  <p className="font-orbitron text-xl font-bold text-white mb-3">{formatNaira(item.value)}</p>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: `${(item.value / maxVal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary panels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Financial Health",   rows: [
            { k: "Revenue (MTD)", v: formatNaira(d.revenueThisMonth), c: "text-secondary", denied: denied("invoices") },
            { k: "Outstanding",   v: formatNaira(d.outstandingInvoices), c: "text-amber-400", denied: denied("invoices") },
          ] },
          { label: "Operations",         rows: [
            { k: "Open Tickets",    v: String(d.openTicketsCount), c: "text-white", denied: denied("tickets") },
            { k: "Active Projects", v: String(d.activeProjectsCount), c: "text-secondary", denied: denied("projects") },
          ] },
          { label: "Client Base",        rows: [
            { k: "Active Clients", v: String(d.activeClientsCount), c: "text-emerald-400", denied: denied("clients") },
            { k: "Expiring Subs",  v: String(d.expiringSubsCount), c: d.expiringSubsCount > 0 ? "text-amber-400" : "text-white/40", denied: denied("subscriptions") },
          ] },
        ].map((panel) => (
          <div key={panel.label} className="surface-card p-5">
            <p className="text-xs text-white/40 font-helvetica uppercase tracking-wider mb-3">{panel.label}</p>
            <div className="space-y-2">
              {panel.rows.map((r) => <PanelRow key={r.k} {...r} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
