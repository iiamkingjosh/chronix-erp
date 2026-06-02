"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getWHTRecords, getPAYERecords } from "@/lib/tax-service";
import { formatNaira } from "@/types/finance";
import { currentPeriod, ytdStart } from "@/types/tax";
import { cn } from "@/lib/utils";

interface TaxDashboardData {
  vatCollectedMTD:   number;
  vatPaidMTD:        number;
  vatNetPayable:     number;
  whtRecordsCount:   number;
  whtPendingCerts:   number;
  payeObligationMTD: number;
  estimatedCIT:      number;
  ytdRevenue:        number;
  ytdExpenses:       number;
}

const ZERO: TaxDashboardData = {
  vatCollectedMTD: 0, vatPaidMTD: 0, vatNetPayable: 0,
  whtRecordsCount: 0, whtPendingCerts: 0,
  payeObligationMTD: 0, estimatedCIT: 0,
  ytdRevenue: 0, ytdExpenses: 0,
};

const FILING_DEADLINES = [
  { label: "VAT Filing",        day: "21st of every month",              href: "/dashboard/tax/vat",       color: "bg-secondary/15 text-secondary border-secondary/30" },
  { label: "WHT Remittance",    day: "21st of every month",              href: "/dashboard/tax/wht",       color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { label: "PAYE Remittance",   day: "10th of every month",              href: "/dashboard/tax/paye",      color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { label: "Annual CIT",        day: "6 months after FYE",               href: "/dashboard/tax/corporate", color: "bg-accent/15 text-accent border-accent/30" },
  { label: "Annual PAYE",       day: "31st January",                     href: "/dashboard/tax/paye",      color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { label: "CAC Annual Returns", day: "Annually — maintain active status", href: "/dashboard/tax",         color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
];

function Spinner() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="surface-card p-5 h-24">
          <div className="w-16 h-2 bg-white/8 rounded mb-3" /><div className="w-24 h-6 bg-white/12 rounded" />
        </div>
      ))}
    </div>
  );
}

function KPICard({ label, value, accent = "text-white", sub, href, icon }: {
  label: string; value: string; accent?: string; sub?: string; href?: string; icon: string;
}) {
  const body = (
    <div className="surface-card p-5 flex flex-col gap-2 min-h-[100px] overflow-hidden hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[10px] text-white/40 uppercase tracking-widest font-helvetica leading-tight">{label}</span>
        <span className="text-xl shrink-0">{icon}</span>
      </div>
      <p className={cn("font-orbitron text-xl font-bold tabular-nums leading-none truncate", accent)}>{value}</p>
      {sub && <p className="text-xs text-white/30 font-helvetica truncate">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export default function TaxDashboardPage() {
  const [data, setData]       = useState<TaxDashboardData>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const period = currentPeriod();
    const ytd    = ytdStart();

    Promise.all([
      getDocs(collection(db, "invoices")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "purchase_orders")).catch(() => ({ docs: [] })),
      getWHTRecords().catch(() => []),
      getPAYERecords(period).catch(() => []),
    ]).then(([invSnap, poSnap, whtRecs, payeRecs]) => {
      const invoices = invSnap.docs.map((d) => ({ ...d.data() })) as Record<string, unknown>[];
      const pos      = poSnap.docs.map((d) => ({ ...d.data() })) as Record<string, unknown>[];

      const vatRate = 0.075;

      const vatCollectedMTD = invoices
        .filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(period))
        .reduce((s, i) => s + (i.vatAmount != null ? Number(i.vatAmount) : Number(i.total as number) * vatRate || 0), 0);

      const vatPaidMTD = pos
        .filter((p) => p.status === "paid" && String(p.paidAt ?? p.createdAt ?? "").startsWith(period))
        .reduce((s, p) => s + (Number(p.vatAmount) || 0), 0);

      const ytdRevenue = invoices
        .filter((i) => i.status === "paid" && String(i.invoiceDate ?? "") >= ytd)
        .reduce((s, i) => s + (Number(i.total) || 0), 0);

      const ytdExpenses = pos
        .filter((p) => (p.status === "approved" || p.status === "delivered") && String(p.createdAt ?? "") >= ytd)
        .reduce((s, p) => s + (Number(p.total) || 0), 0);

      const taxableProfit = Math.max(ytdRevenue - ytdExpenses, 0);
      const payeObligation = payeRecs.reduce((s, r) => s + (r.payeAmount || 0), 0);

      setData({
        vatCollectedMTD,
        vatPaidMTD,
        vatNetPayable:     vatCollectedMTD - vatPaidMTD,
        whtRecordsCount:   whtRecs.length,
        whtPendingCerts:   whtRecs.filter((r) => r.certStatus === "pending").length,
        payeObligationMTD: payeObligation,
        estimatedCIT:      taxableProfit * 0.30,
        ytdRevenue,
        ytdExpenses,
      });
    }).finally(() => setLoading(false));

  }, []);

  if (loading) return <Spinner />;

  const d = data;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Disclaimer */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
        <span className="text-amber-400 shrink-0">⚠</span>
        <p className="text-amber-300/80 text-xs font-helvetica">
          All tax figures are <strong className="text-amber-300">estimates only</strong> based on recorded transactions. This is not a tax filing tool — errors may arise from incorrect computation, misclassification, or incomplete records. Always verify with a qualified tax advisor before submitting to FIRS/LIRS.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="VAT Payable (MTD)"    value={formatNaira(d.vatNetPayable)}    icon="🧾" accent={d.vatNetPayable > 0 ? "text-amber-400" : "text-white/40"} sub="collected − expenses" href="/dashboard/tax/vat" />
        <KPICard label="VAT Collected (MTD)"  value={formatNaira(d.vatCollectedMTD)}  icon="📥" accent="text-secondary"  href="/dashboard/tax/vat" />
        <KPICard label="VAT on Expenses"      value={formatNaira(d.vatPaidMTD)}       icon="📤" accent="text-white/70"   href="/dashboard/tax/vat" />
        <KPICard label="WHT Records"          value={String(d.whtRecordsCount)}        icon="📋" accent="text-white"      sub={`${d.whtPendingCerts} certs pending`} href="/dashboard/tax/wht" />
        <KPICard label="PAYE Obligation (MTD)" value={formatNaira(d.payeObligationMTD)} icon="👥" accent="text-purple-400" href="/dashboard/tax/paye" />
        <KPICard label="Estimated CIT (YTD)"  value={formatNaira(d.estimatedCIT)}     icon="🏛️" accent="text-accent"    sub="30% of taxable profit" href="/dashboard/tax/corporate" />
        <KPICard label="Revenue YTD"          value={formatNaira(d.ytdRevenue)}        icon="💰" accent="text-emerald-400" href="/dashboard/finance/invoices" />
        <KPICard label="Expenses YTD"         value={formatNaira(d.ytdExpenses)}       icon="📦" accent="text-white/70"   href="/dashboard/procurement/orders" />
      </div>

      {/* Filing Deadlines */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Filing Deadlines</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {FILING_DEADLINES.map((fd) => (
            <Link key={fd.label} href={fd.href} className="px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl hover:border-white/20 transition-colors">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", fd.color)}>
                {fd.label}
              </span>
              <p className="text-xs text-white/40 font-helvetica mt-2">{fd.day}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="surface-card p-6">
        <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Log WHT Record",   href: "/dashboard/tax/wht",      icon: "➕" },
            { label: "View VAT Summary", href: "/dashboard/tax/vat",      icon: "🧾" },
            { label: "Run PAYE Calc",    href: "/dashboard/tax/paye",     icon: "👥" },
            { label: "Corporate Tax",    href: "/dashboard/tax/corporate", icon: "🏛️" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
              <span>{a.icon}</span>
              <span className="text-sm text-white/70 group-hover:text-white transition-colors font-helvetica flex-1">{a.label}</span>
              <span className="text-white/20 group-hover:text-accent text-xs">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
