"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatNaira } from "@/types/finance";
import { getInvoiceRevenue } from "@/lib/finance-service";
import { ytdStart } from "@/types/tax";
import { cn } from "@/lib/utils";

function getCITRate(revenue: number): { rate: number; label: string } {
  if (revenue < 25_000_000)   return { rate: 0,    label: "0% — Small company (< ₦25M)" };
  if (revenue <= 100_000_000) return { rate: 0.20, label: "20% — Medium company (₦25M–₦100M)" };
  return                             { rate: 0.30, label: "30% — Large company (> ₦100M)" };
}

interface CITData {
  ytdRevenue:     number;
  ytdExpenses:    number;
  grossProfit:    number;
  taxableProfit:  number;
  estimatedCIT:   number;
  effectiveRate:  number;
  citRate:        number;
  citRateLabel:   string;
  year:           number;
}

const ZERO: CITData = {
  ytdRevenue: 0, ytdExpenses: 0, grossProfit: 0,
  taxableProfit: 0, estimatedCIT: 0, effectiveRate: 0,
  citRate: 0, citRateLabel: "0% — Small company (< ₦25M)",
  year: new Date().getFullYear(),
};

export default function CorporateTaxPage() {
  const [data, setData]       = useState<CITData>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ytd  = ytdStart();
    const year = new Date().getFullYear();

    Promise.all([
      getDocs(collection(db, "invoices")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "purchase_orders")).catch(() => ({ docs: [] })),
      getDocs(collection(db, "expenses")).catch(() => ({ docs: [] })),
    ]).then(([invSnap, poSnap, expSnap]) => {
      const invoices = invSnap.docs.map((d) => d.data()) as Record<string, unknown>[];
      const pos      = poSnap.docs.map((d) => d.data()) as Record<string, unknown>[];
      const exps     = expSnap.docs.map((d) => d.data()) as Record<string, unknown>[];

      // Revenue: canonical VAT-exclusive calculation, same helper every other page uses
      const ytdRevenue = invoices
        .filter((i) => i.status === "paid" && String(i.invoiceDate ?? "") >= ytd)
        .reduce((s, i) => s + getInvoiceRevenue({
          subtotal:  i.subtotal != null ? Number(i.subtotal) : undefined,
          total:     Number(i.total) || 0,
          vatAmount: i.vatAmount != null ? Number(i.vatAmount) : undefined,
        }), 0);

      // PO expenses: approved, delivered, or paid
      const poExpenses = pos
        .filter((p) => (p.status === "approved" || p.status === "delivered" || p.status === "paid") && String(p.createdAt ?? "") >= ytd)
        .reduce((s, p) => s + (Number(p.total) || 0), 0);

      // Expense claims: approved or paid
      const claimExpenses = exps
        .filter((e) => (e.status === "approved" || e.status === "paid") && String(e.submittedAt ?? e.date ?? "") >= ytd)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const ytdExpenses   = poExpenses + claimExpenses;
      const taxableProfit = Math.max(ytdRevenue - ytdExpenses, 0);
      const { rate, label } = getCITRate(ytdRevenue);
      const estimatedCIT  = taxableProfit * rate;

      setData({
        ytdRevenue,
        ytdExpenses,
        grossProfit:   ytdRevenue - ytdExpenses,
        taxableProfit,
        estimatedCIT,
        effectiveRate: ytdRevenue > 0 ? (estimatedCIT / ytdRevenue) * 100 : 0,
        citRate:       rate,
        citRateLabel:  label,
        year,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  const d = data;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Disclaimer */}
      <div className="flex items-start gap-3 px-4 py-3 bg-secondary/8 border border-secondary/20 rounded-xl">
        <span className="text-secondary shrink-0">ℹ</span>
        <div className="text-xs font-helvetica">
          <p className="text-secondary font-semibold mb-1">Internal Estimate — Based on Your Firestore Data</p>
          <p className="text-white/40">These figures are computed directly from your invoices and purchase orders and are accurate to the data recorded in this system. Before submitting to FIRS, your accountant should also account for capital allowances, depreciation, and any prior losses — adjustments that are not yet tracked here. This page gives you a reliable starting point.</p>
        </div>
      </div>

      {/* Year header */}
      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
            Financial Year {d.year} — YTD Summary
          </h2>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica bg-accent/15 text-accent border-accent/30">
            {d.citRateLabel}
          </span>
        </div>

        {/* P&L Summary */}
        <div className="space-y-3">
          {[
            { label: "Total Revenue (YTD)",       value: formatNaira(d.ytdRevenue),    accent: "text-emerald-400", sub: "paid invoices, excl. VAT" },
            { label: "Total Expenses (YTD)",      value: formatNaira(d.ytdExpenses),   accent: "text-white/70",  sub: "POs (approved/delivered/paid) + expense claims" },
            { label: "Gross Profit",              value: formatNaira(d.grossProfit),   accent: d.grossProfit >= 0 ? "text-secondary" : "text-red-400", sub: "revenue − expenses" },
            { label: "Est. Taxable Profit",       value: formatNaira(d.taxableProfit), accent: "text-white",     sub: "simplified — see disclaimer above" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm text-white/70 font-helvetica">{row.label}</p>
                <p className="text-xs text-white/25 font-helvetica">{row.sub}</p>
              </div>
              <p className={cn("font-orbitron text-xl font-bold tabular-nums", row.accent)}>{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CIT Estimate highlight */}
      <div className={cn("surface-card p-6 border", d.estimatedCIT > 0 ? "border-accent/30 bg-accent/[0.04]" : "border-white/10")}>
        <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">Estimated Corporate Income Tax</p>
        <p className="font-orbitron text-4xl font-bold text-accent tabular-nums">{formatNaira(d.estimatedCIT)}</p>
        <p className="text-white/30 text-sm font-helvetica mt-2">
          Based on {d.citRate * 100}% of estimated taxable profit of {formatNaira(d.taxableProfit)} — Nigeria tiered CIT rate (CITA).
        </p>
        {d.effectiveRate > 0 && (
          <p className="text-white/20 text-xs font-helvetica mt-1">
            Effective rate on revenue: {d.effectiveRate.toFixed(1)}%
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="surface-card p-6">
        <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Key Tax Notes</h3>
        <div className="space-y-3">
          {[
            { icon: "📅", text: "Corporate tax returns are due within 6 months after your financial year end, or 18 months after incorporation — whichever occurs first. Filed through the FIRS electronic platform." },
            { icon: "💼", text: "Actual taxable profit may be reduced by capital allowances, losses carried forward, and other deductions under CITA Cap C21." },
            { icon: "🏛️", text: "Small companies (turnover < ₦25M) pay 0% CIT. Medium companies (₦25M–₦100M) pay 20%. Large companies pay 30%." },
            { icon: "📊", text: "Revenue figures here exclude VAT (7.5%). Expenses include full PO values without WHT adjustments." },
          ].map((n) => (
            <div key={n.text} className="flex items-start gap-3">
              <span className="shrink-0">{n.icon}</span>
              <p className="text-xs text-white/40 font-helvetica">{n.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
