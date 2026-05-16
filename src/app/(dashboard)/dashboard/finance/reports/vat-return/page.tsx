"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { generateVATReturn } from "@/lib/accounting/vat-return";
import { formatNaira } from "@/types/finance";
import type { VATReturn } from "@/types/finance";

export default function VATReturnPage() {
  const { profile } = useAuth();
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport]   = useState<VATReturn | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!profile) return;
    setLoading(true);
    try {
      const mm = String(month).padStart(2, "0");
      setReport(await generateVATReturn(`${year}-${mm}`, profile.uid));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line

  const VATRow = ({ label, amount }: { label: string; amount: number }) =>
    amount === 0 ? null : (
      <tr className="border-b border-white/5">
        <td className="py-2 pl-5 text-sm text-white/70 font-helvetica">{label}</td>
        <td className="py-2 text-sm text-right font-helvetica text-white">{formatNaira(amount)}</td>
      </tr>
    );

  return (
    <div className="animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-28 text-sm">
          {[now.getFullYear(), now.getFullYear()-1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field w-36 text-sm">
          {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => (
            <option key={i} value={i+1}>{m}</option>
          ))}
        </select>
        <button onClick={load} disabled={loading} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
          {loading ? "Loading…" : "Generate"}
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
            <p className="text-white/40 text-xs font-helvetica">No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos</p>
            <p className="font-orbitron text-sm font-bold text-accent mt-4">VAT RETURN — {report.period}</p>
            <p className="text-white/40 text-xs font-helvetica mt-1 font-mono">{report.returnNumber}</p>
          </div>

          {/* Output VAT */}
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2">
            Output VAT — Collected from Customers
          </p>
          <table className="w-full mb-6">
            <tbody>
              <VATRow label="IT Services"     amount={report.vatCollected.itServices}    />
              <VATRow label="Hardware Sales"  amount={report.vatCollected.hardwareSales} />
              <VATRow label="Branding"        amount={report.vatCollected.branding}      />
              <VATRow label="Other Services"  amount={report.vatCollected.other}         />
              <tr className="border-t border-white/20">
                <td className="py-3 text-sm font-bold text-white font-helvetica">Total VAT Collected</td>
                <td className="py-3 text-sm font-bold text-right text-accent font-helvetica">{formatNaira(report.vatCollected.total)}</td>
              </tr>
            </tbody>
          </table>

          {/* Input VAT */}
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2">
            Input VAT — Paid to Suppliers
          </p>
          <table className="w-full mb-6">
            <tbody>
              <VATRow label="Purchases"          amount={report.vatPaid.purchases}          />
              <VATRow label="Operating Expenses" amount={report.vatPaid.operatingExpenses}  />
              <VATRow label="Capital Expenditure" amount={report.vatPaid.capital}           />
              <tr className="border-t border-white/20">
                <td className="py-3 text-sm font-bold text-white font-helvetica">Total VAT Paid</td>
                <td className="py-3 text-sm font-bold text-right text-white/60 font-helvetica">({formatNaira(report.vatPaid.total)})</td>
              </tr>
            </tbody>
          </table>

          {/* Net VAT */}
          <div className="bg-white/5 rounded-xl px-5 py-4 mb-6">
            <table className="w-full">
              <tbody>
                <tr className="border-b border-white/10">
                  <td className="py-2 text-sm text-white/70 font-helvetica">VAT Collected (Output)</td>
                  <td className="py-2 text-sm text-right font-helvetica text-white">{formatNaira(report.vatCollected.total)}</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-2 text-sm text-white/70 font-helvetica">VAT Paid (Input)</td>
                  <td className="py-2 text-sm text-right font-helvetica text-white/60">({formatNaira(report.vatPaid.total)})</td>
                </tr>
                <tr>
                  <td className="py-3 font-orbitron text-sm font-bold text-white">NET VAT</td>
                  <td className="py-3 font-orbitron text-sm font-bold text-right text-accent">{formatNaira(report.netVAT)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payable / Refund */}
          {report.vatPayable > 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4">
              <p className="text-xs text-amber-400/60 font-helvetica uppercase tracking-wider mb-1">Amount Payable to FIRS</p>
              <p className="font-orbitron text-xl font-bold text-amber-400">{formatNaira(report.vatPayable)}</p>
              <p className="text-xs text-white/30 font-helvetica mt-2">
                Due: 21st of following month | TIN: 33646874-0001
              </p>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4">
              <p className="text-xs text-emerald-400/60 font-helvetica uppercase tracking-wider mb-1">VAT Refund Due from FIRS</p>
              <p className="font-orbitron text-xl font-bold text-emerald-400">{formatNaira(report.vatRefundable)}</p>
              <p className="text-xs text-white/30 font-helvetica mt-2">Carry forward or apply for refund</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
            <p className="text-[10px] text-white/20 font-helvetica">
              Status: <span className="uppercase text-accent/60">{report.status}</span>
            </p>
            <p className="text-[10px] text-white/20 font-helvetica">
              Generated {new Date(report.createdAt).toLocaleString("en-GB")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
