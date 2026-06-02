"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { generateProfitLoss, generateQuarterlyPL, generateAnnualPL } from "@/lib/accounting/profit-loss";
import { formatNaira } from "@/types/finance";
import type { ProfitLossReport } from "@/types/finance";
import { cn } from "@/lib/utils";

type Period = "monthly" | "quarterly" | "annual";

function fmtD(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PLReportPage() {
  const { profile } = useAuth();
  const [report, setReport]   = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod]   = useState<Period>("monthly");

  const now          = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [qtr,   setQtr]   = useState(Math.ceil((now.getMonth() + 1) / 3));

  async function load() {
    if (!profile) return;
    setLoading(true);
    try {
      let r: ProfitLossReport;
      if (period === "monthly") {
        const mm    = String(month).padStart(2, "0");
        const start = `${year}-${mm}-01`;
        const end   = new Date(year, month, 0).toISOString().split("T")[0];
        r = await generateProfitLoss(start, end, profile.uid);
        r.period = "monthly";
      } else if (period === "quarterly") {
        r = await generateQuarterlyPL(year, qtr, profile.uid);
      } else {
        r = await generateAnnualPL(year, profile.uid);
      }
      setReport(r);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [period, year, month, qtr]); // eslint-disable-line

  const Row = ({ label, amount, indent = false }: { label: string; amount: number; indent?: boolean }) => (
    <tr className={cn("border-b border-white/5", amount === 0 && "opacity-30")}>
      <td className={cn("py-2 text-sm text-white/70 font-helvetica", indent && "pl-6")}>{label}</td>
      <td className="py-2 text-sm text-right font-helvetica text-white">{formatNaira(amount)}</td>
    </tr>
  );
  const Total = ({ label, amount, highlight }: { label: string; amount: number; highlight?: string }) => (
    <tr className={cn("border-t border-white/20", highlight)}>
      <td className="py-3 text-sm font-bold text-white font-helvetica">{label}</td>
      <td className={cn("py-3 text-sm font-bold text-right font-helvetica", amount >= 0 ? "text-emerald-400" : "text-red-400")}>{formatNaira(amount)}</td>
    </tr>
  );

  return (
    <div className="animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {(["monthly","quarterly","annual"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica capitalize transition-colors",
                period === p ? "bg-accent text-black font-semibold" : "text-white/40 hover:text-white")}>
              {p}
            </button>
          ))}
        </div>

        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-28 text-sm">
          {[now.getFullYear(), now.getFullYear()-1, now.getFullYear()-2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {period === "monthly" && (
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field w-36 text-sm">
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => (
              <option key={i} value={i+1}>{m}</option>
            ))}
          </select>
        )}
        {period === "quarterly" && (
          <select value={qtr} onChange={(e) => setQtr(Number(e.target.value))} className="input-field w-28 text-sm">
            {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </select>
        )}

        <button onClick={load} disabled={loading} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!report ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="surface-card p-8 max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8 pb-6 border-b border-white/10">
            <p className="font-orbitron text-lg font-bold text-white">CHRONIX TECHNOLOGY LIMITED</p>
            <p className="text-white/40 text-xs font-helvetica mt-1">RC 8946587 | TIN: 33646874-0001</p>
            <p className="font-orbitron text-sm font-bold text-accent mt-4">PROFIT & LOSS STATEMENT</p>
            <p className="text-white/40 text-xs font-helvetica mt-2">
              {fmtD(report.startDate)} — {fmtD(report.endDate)}
            </p>
          </div>

          {/* Revenue */}
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2">Revenue</p>
          <table className="w-full mb-4">
            <tbody>
              <Row label="IT Consulting Services"  amount={report.revenue.itConsulting}   indent />
              <Row label="Network Infrastructure"  amount={report.revenue.networkServices} indent />
              <Row label="Hardware Sales"          amount={report.revenue.hardwareSales}   indent />
              <Row label="Branding & Design"       amount={report.revenue.branding}        indent />
              <Row label="Software Development"    amount={report.revenue.softwareDev}     indent />
              <Row label="Other Revenue"           amount={report.revenue.other}           indent />
              <Total label="Total Revenue" amount={report.revenue.total} />
            </tbody>
          </table>

          {/* Cost of Sales */}
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2 mt-4">Cost of Sales</p>
          <table className="w-full mb-4">
            <tbody>
              <Row label="Cost of Hardware Sold"  amount={report.costOfSales.hardwareCost}   indent />
              <Row label="Direct Project Costs"   amount={report.costOfSales.directCosts}    indent />
              <Row label="Subcontractor Costs"    amount={report.costOfSales.subcontractors} indent />
              <Total label="Total Cost of Sales" amount={-report.costOfSales.total} />
            </tbody>
          </table>

          {/* Gross Profit */}
          <div className="bg-accent/10 border border-accent/20 rounded-xl px-5 py-3 mb-6 flex justify-between items-center">
            <span className="font-orbitron text-sm font-bold text-white">GROSS PROFIT</span>
            <div className="text-right">
              <p className="font-orbitron text-sm font-bold text-accent">{formatNaira(report.grossProfit)}</p>
              <p className="text-[10px] text-white/40 font-helvetica">{report.grossMargin.toFixed(1)}% margin</p>
            </div>
          </div>

          {/* Operating Expenses */}
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2">Operating Expenses</p>
          <table className="w-full mb-4">
            <tbody>
              <Row label="Salaries & Wages"        amount={report.operatingExpenses.salaries}      indent />
              <Row label="Rent"                    amount={report.operatingExpenses.rent}          indent />
              <Row label="Internet & Telecoms"     amount={report.operatingExpenses.internet}      indent />
              <Row label="Fuel & Transport"        amount={report.operatingExpenses.fuel}          indent />
              <Row label="Marketing"               amount={report.operatingExpenses.marketing}     indent />
              <Row label="Professional Fees"       amount={report.operatingExpenses.professional}  indent />
              <Row label="Meals & Entertainment"   amount={report.operatingExpenses.meals}         indent />
              <Row label="Equipment & Supplies"    amount={report.operatingExpenses.equipment}     indent />
              <Row label="Utilities"               amount={report.operatingExpenses.utilities}     indent />
              <Row label="Subscriptions"           amount={report.operatingExpenses.subscriptions} indent />
              <Row label="Other Expenses"          amount={report.operatingExpenses.other}         indent />
              <Total label="Total Operating Expenses" amount={-report.operatingExpenses.total} />
            </tbody>
          </table>

          {/* Net Profit */}
          <div className={cn("rounded-xl px-5 py-4 flex justify-between items-center border",
            report.netProfit >= 0
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-red-500/10 border-red-500/20")}>
            <span className="font-orbitron text-base font-bold text-white">NET PROFIT</span>
            <div className="text-right">
              <p className={cn("font-orbitron text-base font-bold", report.netProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                {formatNaira(report.netProfit)}
              </p>
              <p className="text-[10px] text-white/40 font-helvetica">{report.netMargin.toFixed(1)}% net margin</p>
            </div>
          </div>

          <p className="text-[10px] text-white/20 font-helvetica mt-6 text-center">
            Generated {new Date(report.generatedAt).toLocaleString("en-GB")}
          </p>
        </div>
      )}
    </div>
  );
}
