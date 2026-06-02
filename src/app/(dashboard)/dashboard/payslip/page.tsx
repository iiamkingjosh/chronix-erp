"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { MONTHS } from "@/types/hr";
import type { PayslipSummary } from "@/types/hr";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

function generateMonths(): Array<{ month: number; year: number }> {
  const result: Array<{ month: number; year: number }> = [];
  let m = 5, y = 2026;
  const now = new Date();
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    result.push({ month: m, year: y });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result.reverse();
}

function PayslipModal({
  summary, uid, onClose,
}: {
  summary: PayslipSummary;
  uid:     string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(
        `/api/payslip/pdf?uid=${uid}&year=${summary.year}&month=${summary.month}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `payslip-${MONTHS[summary.month - 1]}-${summary.year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const period = `${MONTHS[summary.month - 1]} ${summary.year}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-lg p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-orbitron text-lg font-bold text-white">{period}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        <div className="mb-4 pb-4 border-b border-white/10">
          <p className="font-orbitron text-xs font-bold text-secondary">CHRONIX TECHNOLOGY LIMITED</p>
          <p className="text-white/30 text-[10px] font-helvetica mt-0.5">
            No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos · Info@chronixtechnology.com
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 text-xs font-helvetica">
          <div>
            <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Employee</p>
            <p className="text-white">{summary.employeeName}</p>
          </div>
          <div>
            <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Pay Period</p>
            <p className="text-white">{period}</p>
          </div>
          <div>
            <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Role</p>
            <p className="text-white">{summary.employeeRole}</p>
          </div>
          <div>
            <p className="text-white/30 uppercase tracking-wider text-[9px] mb-0.5">Reference</p>
            <p className="text-accent font-orbitron text-[10px]">{summary.referenceNumber}</p>
          </div>
        </div>

        <div className="space-y-0 text-sm font-helvetica mb-5">
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-white/50">Gross Salary</span>
            <span className="text-white">{formatNaira(summary.baseSalary)}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-white/5">
            <span className="text-white/50">PAYE (Income Tax)</span>
            <span className="text-red-400">−{formatNaira(summary.payeAmount)}</span>
          </div>
          {summary.deductions > 0 && (
            <div className="flex justify-between py-2.5 border-b border-white/5">
              <span className="text-white/50">Other Deductions</span>
              <span className="text-red-400">−{formatNaira(summary.deductions)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 mt-1">
            <span className="font-orbitron text-sm font-bold text-white">NET PAY</span>
            <span className="font-orbitron text-xl font-bold text-accent">{formatNaira(summary.netPay)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <span className={cn(
            "text-xs font-semibold px-3 py-1 rounded-full border font-helvetica",
            summary.status === "paid"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
          )}>
            {summary.status === "paid" ? "PAID" : "PENDING"}
          </span>
          {summary.status === "paid" && summary.paidAt && (
            <span className="text-white/30 text-xs font-helvetica">
              on {new Date(summary.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
        >
          {downloading ? "Generating PDF…" : "↓ Download as PDF"}
        </button>
      </div>
    </div>
  );
}

export default function PayslipPage() {
  const { profile } = useAuth();
  const [summaries,    setSummaries]    = useState<PayslipSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selected,     setSelected]     = useState<PayslipSummary | null>(null);
  const [checked,      setChecked]      = useState<Set<string>>(new Set());
  const [bulkDl,       setBulkDl]       = useState(false);

  const months = generateMonths();

  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/payslip?uid=${profile.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as PayslipSummary[];
        if (!cancelled) setSummaries(data);
      } catch {
        if (!cancelled) setError("Failed to load payslip data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.uid]);

  function toggleRow(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleBulkDownload() {
    if (!profile || !checked.size) return;
    setBulkDl(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const monthsList = [...checked].map((k) => {
        const [y, m] = k.split("-").map(Number);
        return { year: y, month: m };
      });
      const res = await fetch("/api/payslip/pdf/bulk", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ uid: profile.uid, months: monthsList }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed");
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      // filename comes from Content-Disposition but browser fallback:
      a.download = "payslip-compiled.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setChecked(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate compiled PDF.");
    } finally {
      setBulkDl(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm font-helvetica py-8 text-center">{error}</p>;
  }

  const availableKeys = months
    .filter(({ month, year }) => summaries.some((x) => x.month === month && x.year === year))
    .map(({ month, year }) => `${year}-${month}`);

  const allChecked = availableKeys.length > 0 && availableKeys.every((k) => checked.has(k));

  function toggleAll() {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(availableKeys));
  }

  return (
    <>
      {/* Bulk action bar */}
      {availableKeys.length > 0 && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <button
            onClick={toggleAll}
            className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            {allChecked ? "Deselect All" : "Select All"}
          </button>

          {checked.size > 0 && (
            <button
              onClick={handleBulkDownload}
              disabled={bulkDl}
              className={cn(
                "flex items-center gap-2 text-xs font-helvetica px-4 py-1.5 rounded-lg border transition-colors",
                bulkDl
                  ? "border-white/10 text-white/30 cursor-not-allowed"
                  : "border-accent/40 text-accent hover:bg-accent/10"
              )}
            >
              {bulkDl ? (
                <>
                  <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>↓ Download Compiled PDF ({checked.size} month{checked.size !== 1 ? "s" : ""})</>
              )}
            </button>
          )}

          {checked.size === 0 && (
            <p className="text-xs text-white/20 font-helvetica">
              Tick months to download a compiled statement
            </p>
          )}
        </div>
      )}

      <div className="surface-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-5 py-4 w-10" />
              {["Period", "Gross", "PAYE", "Net Pay", "Status", ""].map((h) => (
                <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {months.map(({ month, year }) => {
              const s   = summaries.find((x) => x.month === month && x.year === year) ?? null;
              const key = `${year}-${month}`;
              return (
                <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                  {/* Checkbox — only for months that have a payslip */}
                  <td className="px-5 py-4 w-10">
                    {s && (
                      <input
                        type="checkbox"
                        checked={checked.has(key)}
                        onChange={() => toggleRow(key)}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 accent-[#FF761B] cursor-pointer"
                      />
                    )}
                  </td>
                  <td className="px-5 py-4 font-helvetica text-sm text-white font-semibold">
                    {MONTHS[month - 1]} {year}
                  </td>
                  <td className="px-5 py-4 text-sm font-helvetica text-white/70">
                    {s ? formatNaira(s.baseSalary) : <span className="text-white/20">—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm font-helvetica text-red-400/80">
                    {s ? `−${formatNaira(s.payeAmount)}` : <span className="text-white/20">—</span>}
                  </td>
                  <td className="px-5 py-4 text-sm font-helvetica font-semibold text-white">
                    {s ? formatNaira(s.netPay) : <span className="text-white/20">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {s ? (
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                        s.status === "paid"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      )}>
                        {s.status === "paid" ? "Paid" : "Pending"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/20 font-helvetica">Not generated</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {s && (
                      <button
                        onClick={() => setSelected(s)}
                        className="text-xs text-white/40 hover:text-accent font-helvetica transition-colors"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && profile && (
        <PayslipModal
          summary={selected}
          uid={profile.uid}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
