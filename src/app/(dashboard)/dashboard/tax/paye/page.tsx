"use client";

import { useEffect, useState } from "react";
import { getPAYERecords, createPAYERecord } from "@/lib/tax-service";
import { getEmployees } from "@/lib/hr-service";
import { computeMonthlyPAYE, currentPeriod, formatTaxDate } from "@/types/tax";
import type { PAYERecord } from "@/types/tax";
import type { Employee } from "@/types/hr";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const PAYE_BANDS = [
  { range: "₦0 – ₦800,000",             rate: "0%"  },
  { range: "₦800,001 – ₦3,000,000",     rate: "15%" },
  { range: "₦3,000,001 – ₦12,000,000",  rate: "18%" },
  { range: "₦12,000,001 – ₦25,000,000", rate: "21%" },
  { range: "₦25,000,001 – ₦50,000,000", rate: "23%" },
  { range: "Above ₦50,000,000",         rate: "25%" },
];

function buildPeriodOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) });
  }
  return opts;
}

/* ── Export helpers ─────────────────────────────────────────── */

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function doExportCSV(records: PAYERecord[], period: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Employee", "Monthly Gross (NGN)", "Annual Gross (NGN)", "Monthly PAYE (NGN)", "Annual PAYE (NGN)", "Eff. Rate (%)"];
  const rows = records.map((r) => {
    const effRate = r.annualGross > 0 ? ((r.annualPAYE / r.annualGross) * 100).toFixed(1) : "0";
    return [r.employeeName, r.grossSalary, r.annualGross, r.payeAmount, r.annualPAYE, effRate];
  });
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `paye-${period}.csv`);
}

function doExportXLS(records: PAYERecord[], period: string) {
  const esc = (s: string | number) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const type = (v: string | number) => (typeof v === "number" ? "Number" : "String");
  const headers = ["Employee", "Monthly Gross (NGN)", "Annual Gross (NGN)", "Monthly PAYE (NGN)", "Annual PAYE (NGN)", "Eff. Rate (%)"];
  const rows = records.map((r) => {
    const effRate = r.annualGross > 0 ? ((r.annualPAYE / r.annualGross) * 100).toFixed(1) : "0";
    return [r.employeeName, r.grossSalary, r.annualGross, r.payeAmount, r.annualPAYE, effRate];
  });
  const headerXML = headers.map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const rowsXML = rows.map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="${type(c)}">${esc(c)}</Data></Cell>`).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="PAYE Records"><Table><Row>${headerXML}</Row>${rowsXML}</Table></Worksheet></Workbook>`;
  triggerDownload(new Blob([xml], { type: "application/vnd.ms-excel" }), `paye-${period}.xls`);
}

function doExportPDF(records: PAYERecord[], period: string) {
  const totalGross = records.reduce((s, r) => s + r.grossSalary, 0);
  const totalPAYE  = records.reduce((s, r) => s + r.payeAmount, 0);
  const rowsHTML = records
    .map((r) => {
      const effRate = r.annualGross > 0 ? ((r.annualPAYE / r.annualGross) * 100).toFixed(1) : "0";
      return `<tr><td>${r.employeeName}</td><td class="num">₦${r.grossSalary.toLocaleString()}</td><td class="num">₦${r.annualGross.toLocaleString()}</td><td class="num">₦${r.payeAmount.toLocaleString()}</td><td class="num">₦${r.annualPAYE.toLocaleString()}</td><td class="ctr">${effRate}%</td></tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PAYE Records — ${period}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:32px;font-size:12px}h1{font-size:18px;margin-bottom:4px}p.sub{color:#666;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{background:#f4f4f4;border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}td{border:1px solid #eee;padding:6px 8px}.num{text-align:right}.ctr{text-align:center}tfoot td{background:#f9f9f9;font-weight:600}@media print{body{padding:16px}}</style></head><body><h1>PAYE Tax Records</h1><p class="sub">Period: ${period} &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; ${records.length} employee${records.length !== 1 ? "s" : ""}</p><table><thead><tr><th>Employee</th><th>Monthly Gross</th><th>Annual Gross</th><th>Monthly PAYE</th><th>Annual PAYE</th><th>Eff. Rate</th></tr></thead><tbody>${rowsHTML}</tbody><tfoot><tr><td style="font-weight:600">Total</td><td class="num">₦${totalGross.toLocaleString()}</td><td></td><td class="num">₦${totalPAYE.toLocaleString()}</td><td></td><td></td></tr></tfoot></table></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

/* ── Component ──────────────────────────────────────────────── */

export default function PAYEPage() {
  const { profile }               = useAuth();
  const [period, setPeriod]       = useState(currentPeriod());
  const [records, setRecords]     = useState<PAYERecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [runError, setRunError]   = useState<string | null>(null);
  const [showBands, setShowBands] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const canManage     = profile ? hasPermission(profile.role, "manage:tax") : false;
  const periodOptions = buildPeriodOptions();

  useEffect(() => {
    Promise.all([
      getPAYERecords(period).catch(() => []),
      getEmployees().catch(() => []),
    ]).then(([recs, emps]) => {
      setRecords(recs);
      setEmployees(emps.filter((e) => e.status === "active"));
    }).finally(() => setLoading(false));
  }, [period]);

  async function handleRunPAYE() {
    if (!profile || !canManage) return;
    setRunning(true);
    try {
      const now = new Date().toISOString();
      const newRecs: PAYERecord[] = [];
      for (const emp of employees) {
        const existing = records.find((r) => r.employeeUid === emp.uid && r.period === period);
        if (existing) continue;
        const { monthly, annual } = computeMonthlyPAYE(emp.salary);
        if (monthly <= 0) continue;
        const rec = await createPAYERecord({
          employeeUid:  emp.uid,
          employeeName: emp.fullName,
          period,
          grossSalary:  emp.salary,
          annualGross:  emp.salary * 12,
          payeAmount:   monthly,
          annualPAYE:   annual,
          createdAt:    now,
        });
        newRecs.push(rec);
      }
      setRecords((prev) => [...prev, ...newRecs]);
      if (newRecs.length > 0) {
        const total = newRecs.reduce((s, r) => s + r.payeAmount, 0);
        logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "invoices", details: `PAYE computed for ${newRecs.length} employee${newRecs.length !== 1 ? "s" : ""} — period ${period}, total ₦${total.toLocaleString()}`, timestamp: new Date().toISOString() });
      }

      /* Push + email notification (best-effort) */
      if (newRecs.length > 0) {
        const total = newRecs.reduce((s, r) => s + r.payeAmount, 0);
        auth.currentUser?.getIdToken().then((idToken) => {
          fetch("/api/notifications/send", {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body:    JSON.stringify({
              type:        "renewal_due",
              title:       "PAYE Calculation Completed",
              message:     `PAYE computed for ${newRecs.length} employee${newRecs.length !== 1 ? "s" : ""} — period ${period}. Total obligation: ${formatNaira(total)}.`,
              link:        "/dashboard/tax/paye",
              targetRoles: ["CEO", "CFO", "HR", "System Admin"],
              sendEmail:   true,
              sendPush:    true,
              dedupeKey:   `paye-run-${period}`,
            }),
          }).catch((e) => console.error("PAYE notification failed:", e));
        }).catch((e) => console.error("PAYE getIdToken failed:", e));
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to run PAYE calculation");
    } finally { setRunning(false); }
  }

  const totalPAYE  = records.reduce((s, r) => s + r.payeAmount, 0);
  const alreadyRun = employees.every((e) => records.some((r) => r.employeeUid === e.uid));

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">

      {runError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-red-300/80 text-sm font-helvetica flex-1">{runError}</p>
          <button onClick={() => setRunError(null)} className="text-xs text-red-400 hover:text-red-300 font-helvetica border border-red-500/20 hover:border-red-400/40 px-3 py-1 rounded-lg transition-colors shrink-0">Dismiss</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="field-label">Period</label>
            <select value={period} onChange={(e) => { setPeriod(e.target.value); setLoading(true); }} className="input-field w-52">
              {periodOptions.map((o) => <option key={o.value} value={o.value} className="bg-primary-dark">{o.label}</option>)}
            </select>
          </div>
          {canManage && (
            <button
              onClick={handleRunPAYE}
              disabled={running || alreadyRun || employees.length === 0}
              className="btn-primary text-xs px-4 py-2.5 disabled:opacity-40"
            >
              {running ? "Computing…" : alreadyRun ? "✓ PAYE Run" : `Run PAYE for ${employees.length} employees`}
            </button>
          )}
          <button
            onClick={() => setShowBands((v) => !v)}
            className="text-xs text-secondary hover:text-white font-helvetica transition-colors border border-secondary/20 hover:border-white/20 px-3 py-2 rounded-lg"
          >
            {showBands ? "Hide" : "View"} Tax Bands
          </button>
        </div>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExport((v) => !v)}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 text-xs border border-white/20 text-white/60 hover:text-white hover:border-white/40 px-4 py-2.5 rounded-lg font-helvetica transition-colors disabled:opacity-30"
          >
            Export <span className="text-[10px]">▾</span>
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#0d0d14] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
              {[
                { label: "CSV (.csv)",   fn: () => doExportCSV(records, period) },
                { label: "PDF (Print)",  fn: () => doExportPDF(records, period) },
                { label: "Excel (.xls)", fn: () => doExportXLS(records, period) },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { item.fn(); setShowExport(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/5 font-helvetica transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PAYE bands */}
      {showBands && (
        <div className="surface-card p-5 border border-purple-500/20 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Nigerian PAYE Bands (Annual Income)</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-2 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Annual Income Range</th>
                  <th className="px-4 py-2 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Marginal Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {PAYE_BANDS.map((b) => (
                  <tr key={b.range}>
                    <td className="px-4 py-2 text-sm text-white/70 font-helvetica">{b.range}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-purple-400 font-helvetica text-right">{b.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/20 font-helvetica mt-3">Rates are marginal (applied per band), not flat. First ₦800,000 is tax-free. Based on PITA (as amended) and Finance Act 2024.</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total PAYE Obligation", value: formatNaira(totalPAYE),        accent: "text-purple-400", sub: `for ${records.length} employee${records.length !== 1 ? "s" : ""}` },
          { label: "Annual Projection",     value: formatNaira(totalPAYE * 12),   accent: "text-white/70" },
          { label: "Employees (Active)",    value: String(employees.length),      accent: "text-white" },
        ].map((c) => (
          <div key={c.label} className="surface-card p-5">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{c.label}</p>
            <p className={cn("font-orbitron text-2xl font-bold tabular-nums", c.accent)}>{c.value}</p>
            {c.sub && <p className="text-xs text-white/25 font-helvetica mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Remittance notice */}
      {totalPAYE > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-purple-500/8 border border-purple-500/20 rounded-xl">
          <span className="text-purple-400">ℹ</span>
          <p className="text-purple-300/80 text-sm font-helvetica">
            PAYE of <strong className="text-purple-300">{formatNaira(totalPAYE)}</strong> must be remitted by the <strong>10th of the following month</strong>. Annual returns due <strong>31st January</strong>.
          </p>
        </div>
      )}

      {/* Records table */}
      <div className="surface-card overflow-hidden">
        {records.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No PAYE records for this period.</p>
            {canManage && employees.length > 0 && (
              <button onClick={handleRunPAYE} className="mt-3 text-accent text-sm font-helvetica hover:underline">
                Run PAYE calculation →
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["Employee", "Monthly Gross", "Annual Gross", "Monthly PAYE", "Annual PAYE", "Eff. Rate"].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.map((rec) => {
                  const effRate = rec.annualGross > 0 ? ((rec.annualPAYE / rec.annualGross) * 100).toFixed(1) : "0";
                  return (
                    <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 text-sm font-semibold text-white font-helvetica">{rec.employeeName}</td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{formatNaira(rec.grossSalary)}</td>
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{formatNaira(rec.annualGross)}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-purple-400 font-helvetica">{formatNaira(rec.payeAmount)}</td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{formatNaira(rec.annualPAYE)}</td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{effRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td className="px-5 py-3 text-xs font-semibold text-white/40 font-helvetica uppercase">Total</td>
                  <td className="px-5 py-3 text-sm font-semibold text-white font-helvetica">{formatNaira(records.reduce((s, r) => s + r.grossSalary, 0))}</td>
                  <td />
                  <td className="px-5 py-3 text-sm font-semibold text-purple-400 font-helvetica">{formatNaira(totalPAYE)}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-white/70 font-helvetica">{formatNaira(records.reduce((s, r) => s + r.annualPAYE, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Creation timestamp for displayed records */}
      {records.length > 0 && (
        <p className="text-xs text-white/20 font-helvetica text-right">
          Last run: {formatTaxDate(records[records.length - 1]?.createdAt?.split("T")[0] ?? "")}
        </p>
      )}
    </div>
  );
}
