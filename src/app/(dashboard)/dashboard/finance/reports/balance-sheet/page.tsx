"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { generateBalanceSheet } from "@/lib/accounting/balance-sheet";
import { formatNaira } from "@/types/finance";

type BS = Awaited<ReturnType<typeof generateBalanceSheet>>;

export default function BalanceSheetPage() {
  const { profile } = useAuth();
  const [asOf, setAsOf]       = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport]   = useState<BS | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!profile) return;
    setLoading(true);
    try { setReport(await generateBalanceSheet(asOf, profile.uid)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [asOf]); // eslint-disable-line

  const Row = ({ label, amount, indent = false }: { label: string; amount: number; indent?: boolean }) => (
    <tr className="border-b border-white/5">
      <td className={`py-2 text-sm text-white/70 font-helvetica ${indent ? "pl-6" : ""}`}>{label}</td>
      <td className="py-2 text-sm text-right font-helvetica text-white">{formatNaira(amount)}</td>
    </tr>
  );
  const Subtotal = ({ label, amount }: { label: string; amount: number }) => (
    <tr className="border-t border-white/20">
      <td className="py-2 text-sm font-semibold text-white font-helvetica">{label}</td>
      <td className="py-2 text-sm font-semibold text-right text-accent font-helvetica">{formatNaira(amount)}</td>
    </tr>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div>
          <label className="text-xs text-white/40 font-helvetica block mb-1">As of Date</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="input-field w-44 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="btn-primary text-xs px-4 py-2 mt-5 disabled:opacity-50">
          {loading ? "Loading…" : "Generate"}
        </button>
      </div>

      {!report ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          {/* ASSETS */}
          <div className="surface-card p-6">
            <p className="font-orbitron text-sm font-bold text-accent mb-4">ASSETS</p>

            <p className="text-xs text-white/30 uppercase tracking-wider font-helvetica mb-2">Current Assets</p>
            <div className="overflow-x-auto">
            <table className="w-full mb-4">
              <tbody>
                <Row label="Cash in Bank"         amount={report.assets.currentAssets.cash}               indent />
                <Row label="Petty Cash"           amount={report.assets.currentAssets.pettyCash}          indent />
                <tr className="border-b border-white/5">
                  <td className="pl-6 py-2 text-sm text-white/40 font-helvetica italic">
                    Accounts Receivable
                    <span className="block text-[10px] text-white/25 font-helvetica mt-0.5 not-italic">
                      Outstanding receivables — from unpaid invoices (memo only, not in total)
                    </span>
                  </td>
                  <td className="py-2 text-sm text-right font-helvetica text-white/40 italic">
                    {formatNaira(report.assets.currentAssets.accountsReceivable)}
                  </td>
                </tr>
                <Row label="Inventory"            amount={report.assets.currentAssets.inventory}          indent />
                <Row label="Prepaid Expenses"     amount={report.assets.currentAssets.prepaidExpenses}    indent />
                <Row label="VAT Recoverable"      amount={report.assets.currentAssets.vatRecoverable}     indent />
                <Subtotal label="Total Current Assets" amount={report.assets.currentAssets.total} />
              </tbody>
            </table>
            </div>

            <p className="text-xs text-white/30 uppercase tracking-wider font-helvetica mb-2 mt-4">Fixed Assets</p>
            <div className="overflow-x-auto">
            <table className="w-full mb-4">
              <tbody>
                <Row label="Office Equipment"   amount={report.assets.fixedAssets.officeEquipment}   indent />
                <Row label="Computer Equipment" amount={report.assets.fixedAssets.computerEquipment} indent />
                <Subtotal label="Total Fixed Assets" amount={report.assets.fixedAssets.total} />
              </tbody>
            </table>
            </div>

            <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 flex justify-between">
              <span className="font-orbitron text-sm font-bold text-white">TOTAL ASSETS</span>
              <span className="font-orbitron text-sm font-bold text-accent">{formatNaira(report.assets.total)}</span>
            </div>
          </div>

          {/* LIABILITIES & EQUITY */}
          <div className="space-y-6">
            <div className="surface-card p-6">
              <p className="font-orbitron text-sm font-bold text-accent mb-4">LIABILITIES</p>
              <p className="text-xs text-white/30 uppercase tracking-wider font-helvetica mb-2">Current Liabilities</p>
              <div className="overflow-x-auto">
              <table className="w-full mb-4">
                <tbody>
                  <Row label="Accounts Payable"               amount={report.liabilities.currentLiabilities.accountsPayable}          indent />
                  <Row label="VAT Payable"                   amount={report.liabilities.currentLiabilities.vatPayable}               indent />
                  <Row label="WHT Payable"                   amount={report.liabilities.currentLiabilities.whtPayable}               indent />
                  <Row label="PAYE Payable"                  amount={report.liabilities.currentLiabilities.payePayable}              indent />
                  <Row label="Payroll Deductions Payable"    amount={report.liabilities.currentLiabilities.payrollDeductionsPayable} indent />
                  <Subtotal label="Total Liabilities" amount={report.liabilities.total} />
                </tbody>
              </table>
              </div>
            </div>

            <div className="surface-card p-6">
              <p className="font-orbitron text-sm font-bold text-accent mb-4">EQUITY</p>
              <div className="overflow-x-auto">
              <table className="w-full mb-4">
                <tbody>
                  <Row label="Share Capital"          amount={report.equity.shareCapital}      indent />
                  <Row label="Retained Earnings"      amount={report.equity.retainedEarnings}  indent />
                  <Row label="Current Year Profit"    amount={report.equity.currentYearProfit} indent />
                  <Subtotal label="Total Equity" amount={report.equity.total} />
                </tbody>
              </table>
              </div>
            </div>

            <div className={`rounded-xl px-4 py-3 flex justify-between border ${
              report.balanced
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-red-500/10 border-red-500/20"}`}>
              <div>
                <p className="font-orbitron text-sm font-bold text-white">TOTAL L + E</p>
                {report.balanced
                  ? <p className="text-[10px] text-emerald-400/60 font-helvetica mt-0.5">✓ Balanced</p>
                  : <p className="text-[10px] text-red-400/60 font-helvetica mt-0.5">⚠ Not balanced</p>}
              </div>
              <span className="font-orbitron text-sm font-bold text-accent self-center">
                {formatNaira(report.totalLiabilitiesAndEquity)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
