"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSalesAnalytics, EMPTY_SALES, LOW_SAMPLE_THRESHOLD, type SalesData } from "@/lib/analytics-service";
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
          <div className="w-28 text-xs text-white/50 font-helvetica text-right truncate shrink-0">{item.label}</div>
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

function MonthlyChart({ data }: { data: SalesData["monthlyRevenue"] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const hasAny = data.some((d) => d.revenue > 0);
  return (
    <div>
      {!hasAny && (
        <p className="text-center text-white/20 text-sm font-helvetica py-4 mb-4">
          No paid invoices yet — revenue chart will populate as invoices are paid.
        </p>
      )}
      <div className="flex items-end gap-2 h-40">
        {data.map((m) => (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
            {m.revenue > 0 && <p className="text-[9px] text-white/40 font-helvetica">{formatNaira(m.revenue).replace("₦", "")}</p>}
            <div className="w-full bg-white/5 rounded-t" style={{ height: "100px" }}>
              <div className="w-full bg-secondary/70 rounded-t transition-all" style={{ height: `${(m.revenue / max) * 100}%`, marginTop: `${100 - (m.revenue / max) * 100}%` }} />
            </div>
            <p className="text-[10px] text-white/40 font-helvetica">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SalesAnalyticsPage() {
  const [data, setData]         = useState<SalesData>(EMPTY_SALES);
  const [loading, setLoading]   = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getSalesAnalytics()
      .then(setData)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const d = data;
  const invoicesDenied = d.deniedSources.includes("invoices");
  const leadsDenied    = d.deniedSources.includes("leads");
  const lowLeadSample  = d.totalLeads < LOW_SAMPLE_THRESHOLD;

  return (
    <div className="animate-fade-in space-y-6">
      {hasError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="text-red-400">⚠</span>
          <p className="text-red-400 text-sm font-helvetica">Could not load sales data. Check Firestore access.</p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Deals Closed (MTD)",   value: String(d.dealsClosedThisMonth),                accent: "text-emerald-400", denied: invoicesDenied },
          { label: "Lead Conversion Rate", value: lowLeadSample ? `${d.leadConversionRate}% (${d.convertedLeads} of ${d.totalLeads})` : `${d.leadConversionRate}%`,
            accent: lowLeadSample ? "text-white/50" : (d.leadConversionRate >= 30 ? "text-emerald-400" : "text-amber-400"), denied: leadsDenied },
          { label: "Pipeline Value",       value: formatNaira(d.pipelineValue),                   accent: "text-secondary", denied: invoicesDenied },
          { label: "Leads Converted",      value: `${d.convertedLeads} / ${d.totalLeads}`,        accent: "text-white", denied: leadsDenied },
        ].map((item) => (
          <div key={item.label} className="surface-card p-5 min-h-[90px]">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{item.label}</p>
            {item.denied ? (
              <p className="text-white/30 text-xs font-helvetica leading-snug mt-2">🔒 You don&apos;t have access to this data.</p>
            ) : (
              <p className={cn("font-orbitron text-2xl font-bold tabular-nums", item.accent)}>{item.value}</p>
            )}
            {item.label === "Lead Conversion Rate" && !item.denied && lowLeadSample && (
              <p className="text-[10px] text-white/30 font-helvetica mt-1">Low sample size — not statistically meaningful yet.</p>
            )}
          </div>
        ))}
      </div>

      {/* Monthly Revenue */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-6">Monthly Revenue (Last 6 Months)</h2>
        {invoicesDenied ? (
          <p className="text-center text-white/30 text-sm font-helvetica py-8">🔒 You don&apos;t have access to invoice data.</p>
        ) : (
          <MonthlyChart data={d.monthlyRevenue} />
        )}
      </div>

      {/* Revenue by Client */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Revenue by Client (Top 10)</h2>
        {invoicesDenied ? (
          <div className="py-8 text-center">
            <p className="text-white/30 text-sm font-helvetica">🔒 You don&apos;t have access to invoice data.</p>
          </div>
        ) : d.revenueByClient.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-white/20 text-sm font-helvetica">No paid invoices yet.</p>
            <Link href="/dashboard/finance/invoices/new" className="mt-2 inline-block text-accent text-sm font-helvetica hover:underline">Create invoice →</Link>
          </div>
        ) : (
          <BarChart data={d.revenueByClient.map((c) => ({ label: c.client, value: c.revenue }))} format={formatNaira} />
        )}
      </div>

      {/* Conversion funnel */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">Lead Conversion Funnel</h2>
        {leadsDenied ? (
          <div className="py-8 text-center">
            <p className="text-white/30 text-sm font-helvetica">🔒 You don&apos;t have access to lead data.</p>
          </div>
        ) : d.totalLeads === 0 ? (
          <div className="py-8 text-center">
            <p className="text-white/20 text-sm font-helvetica">No leads in the system yet.</p>
            <Link href="/dashboard/crm/leads/new" className="mt-2 inline-block text-accent text-sm font-helvetica hover:underline">Add first lead →</Link>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {[
              { label: "Total Leads", value: d.totalLeads, color: "bg-secondary/40" },
              { label: "Converted",   value: d.convertedLeads, color: "bg-emerald-500/40" },
            ].map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-4 flex-1">
                {i > 0 && <div className="text-white/20 text-lg">→</div>}
                <div className={cn("flex-1 rounded-xl p-4 text-center", stage.color)}>
                  <p className="font-orbitron text-2xl font-bold text-white">{stage.value}</p>
                  <p className="text-xs text-white/60 font-helvetica mt-1">{stage.label}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 flex-1">
              <div className="text-white/20 text-lg">→</div>
              <div className="flex-1 rounded-xl p-4 text-center bg-accent/20">
                <p className="font-orbitron text-2xl font-bold text-accent">{d.leadConversionRate}%</p>
                <p className="text-xs text-white/60 font-helvetica mt-1">Conversion Rate</p>
                {lowLeadSample && <p className="text-[10px] text-white/40 font-helvetica mt-1">({d.convertedLeads} of {d.totalLeads} — low sample)</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
