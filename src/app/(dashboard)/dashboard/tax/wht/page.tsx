"use client";

import { useEffect, useState } from "react";
import {
  getWHTRecords, createWHTRecord, updateWHTCertStatus,
} from "@/lib/tax-service";
import { generateWHTId, WHT_CERT_STYLES, formatTaxDate, currentPeriod } from "@/types/tax";
import type { WHTRecord } from "@/types/tax";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const DEFAULT_WHT_RATE = 5;

type PeriodOption = { label: string; value: string };

function buildPeriodOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
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

function doExportCSV(records: WHTRecord[], period: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["WHT ID", "Vendor", "Invoice Amount (NGN)", "WHT Rate (%)", "WHT Amount (NGN)", "Payment Date", "Cert Status", "Source Ref", "Notes"];
  const rows = records.map((r) => [
    r.whtId, r.vendorName, r.invoiceAmount, r.whtRate, r.whtAmount,
    r.paymentDate, r.certStatus, r.sourceRef ?? "", r.notes ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `wht-${period}.csv`);
}

function doExportXLS(records: WHTRecord[], period: string) {
  const esc = (s: string | number) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const type = (v: string | number) => (typeof v === "number" ? "Number" : "String");
  const headers = ["WHT ID", "Vendor", "Invoice Amount (NGN)", "WHT Rate (%)", "WHT Amount (NGN)", "Payment Date", "Cert Status", "Source Ref", "Notes"];
  const rows = records.map((r) => [
    r.whtId, r.vendorName, r.invoiceAmount, r.whtRate, r.whtAmount,
    r.paymentDate, r.certStatus, r.sourceRef ?? "", r.notes ?? "",
  ]);
  const headerXML = headers.map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const rowsXML = rows.map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="${type(c)}">${esc(c)}</Data></Cell>`).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="WHT Records"><Table><Row>${headerXML}</Row>${rowsXML}</Table></Worksheet></Workbook>`;
  triggerDownload(new Blob([xml], { type: "application/vnd.ms-excel" }), `wht-${period}.xls`);
}

function doExportPDF(records: WHTRecord[], period: string) {
  const total = records.reduce((s, r) => s + r.whtAmount, 0);
  const rowsHTML = records
    .map(
      (r) =>
        `<tr><td>${r.whtId}</td><td>${r.vendorName}</td><td class="num">₦${r.invoiceAmount.toLocaleString()}</td><td class="ctr">${r.whtRate}%</td><td class="num">₦${r.whtAmount.toLocaleString()}</td><td>${r.paymentDate}</td><td>${r.certStatus}</td></tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WHT Records — ${period}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:32px;font-size:12px}h1{font-size:18px;margin-bottom:4px}p.sub{color:#666;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{background:#f4f4f4;border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}td{border:1px solid #eee;padding:6px 8px}.num{text-align:right}.ctr{text-align:center}tfoot td{background:#f9f9f9;font-weight:600}@media print{body{padding:16px}}</style></head><body><h1>Withholding Tax Records</h1><p class="sub">Period: ${period} &nbsp;·&nbsp; Generated: ${new Date().toLocaleDateString("en-GB")} &nbsp;·&nbsp; ${records.length} record${records.length !== 1 ? "s" : ""}</p><table><thead><tr><th>WHT ID</th><th>Vendor</th><th>Invoice Amt</th><th>Rate</th><th>WHT Amount</th><th>Date</th><th>Cert Status</th></tr></thead><tbody>${rowsHTML}</tbody><tfoot><tr><td colspan="4" style="font-weight:600">Total</td><td class="num">₦${total.toLocaleString()}</td><td colspan="2"></td></tr></tfoot></table></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

/* ── Component ──────────────────────────────────────────────── */

export default function WHTPage() {
  const { profile }                 = useAuth();
  const [allRecords, setAllRecords] = useState<WHTRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState(currentPeriod());
  const [showForm, setShowForm]     = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [form, setForm]             = useState({
    vendorName: "", invoiceAmount: "", whtRate: String(DEFAULT_WHT_RATE),
    paymentDate: new Date().toISOString().split("T")[0],
    sourceRef: "", notes: "",
  });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canManage     = profile ? hasPermission(profile.role, "manage:tax") : false;
  const periodOptions = buildPeriodOptions();

  useEffect(() => {
    getWHTRecords().then(setAllRecords).finally(() => setLoading(false));
  }, []);

  const filteredRecords = allRecords.filter((r) => r.paymentDate.startsWith(period));
  const whtAmount       = (Number(form.invoiceAmount) || 0) * (Number(form.whtRate) || 0) / 100;
  const totalWHT        = filteredRecords.reduce((s, r) => s + r.whtAmount, 0);
  const pending         = filteredRecords.filter((r) => r.certStatus === "pending").length;
  const issued          = filteredRecords.filter((r) => r.certStatus === "issued").length;

  async function handleCreate() {
    if (!profile || !form.vendorName || !form.invoiceAmount) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rec = await createWHTRecord({
        whtId:         generateWHTId(),
        vendorName:    form.vendorName,
        invoiceAmount: Number(form.invoiceAmount),
        whtRate:       Number(form.whtRate),
        whtAmount:     Math.round(whtAmount * 100) / 100,
        paymentDate:   form.paymentDate,
        sourceRef:     form.sourceRef || undefined,
        notes:         form.notes || undefined,
        certStatus:    "pending",
        createdAt:     new Date().toISOString(),
        createdBy:     profile.uid,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "invoices", entityId: rec.id, entityRef: rec.whtId, details: `WHT record logged: ₦${rec.whtAmount.toLocaleString()} deducted from ${rec.vendorName}`, timestamp: new Date().toISOString() });
      setAllRecords((prev) => [rec, ...prev]);
      setShowForm(false);
      setForm({ vendorName: "", invoiceAmount: "", whtRate: String(DEFAULT_WHT_RATE), paymentDate: new Date().toISOString().split("T")[0], sourceRef: "", notes: "" });

      /* Push + email notification (best-effort) */
      auth.currentUser?.getIdToken().then((idToken) => {
        fetch("/api/notifications/send", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body:    JSON.stringify({
            type:        "renewal_due",
            title:       "WHT Record Logged",
            message:     `WHT of ${formatNaira(rec.whtAmount)} deducted from ${rec.vendorName} has been recorded.`,
            link:        "/dashboard/tax/wht",
            targetRoles: ["Root Admin", "CEO", "CFO", "System Admin"],
            sendEmail:   true,
            sendPush:    true,
          }),
        }).catch((e) => console.error("WHT notification failed:", e));
      }).catch((e) => console.error("WHT getIdToken failed:", e));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save WHT record");
    } finally { setSaving(false); }
  }

  async function handleToggleCert(rec: WHTRecord) {
    const next = rec.certStatus === "pending" ? "issued" : "pending";
    await updateWHTCertStatus(rec.id, next);
    setAllRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, certStatus: next } : r));
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">

      {saveError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-red-300/80 text-sm font-helvetica flex-1">{saveError}</p>
          <button onClick={() => setSaveError(null)} className="text-xs text-red-400 hover:text-red-300 font-helvetica border border-red-500/20 hover:border-red-400/40 px-3 py-1 rounded-lg transition-colors shrink-0">Dismiss</button>
        </div>
      )}

      {/* Toolbar ─ period filter + actions */}
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="field-label">Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input-field w-52">
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value} className="bg-primary-dark">{o.label}</option>
              ))}
            </select>
          </div>
          <div className="pb-2.5 space-y-0.5">
            <p className="text-white/30 text-xs font-helvetica">5% services / contracts · 5% goods · 10% rent, dividends, interest</p>
            <p className="text-white/20 text-[10px] font-helvetica">Remit to FIRS by the 21st of the following month</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2.5">
              + Log WHT Record
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExport((v) => !v)}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 text-xs border border-white/20 text-white/60 hover:text-white hover:border-white/40 px-4 py-2.5 rounded-lg font-helvetica transition-colors disabled:opacity-30"
            >
              Export <span className="text-[10px]">▾</span>
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-[#0d0d14] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
                {[
                  { label: "CSV (.csv)",   fn: () => doExportCSV(filteredRecords, period) },
                  { label: "PDF (Print)",  fn: () => doExportPDF(filteredRecords, period) },
                  { label: "Excel (.xls)", fn: () => doExportXLS(filteredRecords, period) },
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "WHT Records",        value: String(filteredRecords.length), accent: "text-white" },
          { label: "Total WHT Deducted", value: formatNaira(totalWHT),          accent: "text-amber-400" },
          { label: "Certs Pending",      value: String(pending),                accent: pending > 0 ? "text-accent" : "text-white/30" },
          { label: "Certs Issued",       value: String(issued),                 accent: "text-emerald-400" },
        ].map((c) => (
          <div key={c.label} className="surface-card p-5">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{c.label}</p>
            <p className={cn("font-orbitron text-2xl font-bold tabular-nums", c.accent)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && canManage && (
        <div className="surface-card p-6 border border-accent/20 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">New WHT Record</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="field-label">Vendor / Supplier Name</label>
              <input value={form.vendorName} onChange={(e) => setForm((p) => ({ ...p, vendorName: e.target.value }))} placeholder="e.g. Vendor Ltd" className="input-field" />
            </div>
            <div>
              <label className="field-label">Invoice Amount (₦)</label>
              <input type="number" min="0" value={form.invoiceAmount} onChange={(e) => setForm((p) => ({ ...p, invoiceAmount: e.target.value }))} placeholder="0.00" className="input-field" />
            </div>
            <div>
              <label className="field-label">WHT Rate (%)</label>
              <input type="number" min="0" max="20" step="0.5" value={form.whtRate} onChange={(e) => setForm((p) => ({ ...p, whtRate: e.target.value }))} className="input-field" />
              <p className="mt-1 text-[10px] text-white/20 font-helvetica">5% services/contracts · 10% rent/dividends/interest</p>
            </div>
            <div>
              <label className="field-label">WHT Amount (auto)</label>
              <div className="input-field bg-white/[0.02] text-secondary font-semibold">{formatNaira(whtAmount)}</div>
            </div>
            <div>
              <label className="field-label">Payment Date</label>
              <input type="date" value={form.paymentDate} onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="field-label">PO / Invoice Ref (optional)</label>
              <input value={form.sourceRef} onChange={(e) => setForm((p) => ({ ...p, sourceRef: e.target.value }))} placeholder="e.g. PO-26050-A1B2" className="input-field" />
            </div>
            <div className="sm:col-span-3">
              <label className="field-label">Notes (optional)</label>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Additional notes…" className="input-field" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={saving || !form.vendorName || !form.invoiceAmount} className="btn-primary text-xs px-5 py-2.5">
              {saving ? "Saving…" : "Log WHT Record"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica transition-colors px-3">Cancel</button>
          </div>
        </div>
      )}

      {/* Records table */}
      <div className="surface-card overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No WHT records for this period.</p>
            {canManage && (
              <button onClick={() => setShowForm(true)} className="mt-3 text-accent text-sm font-helvetica hover:underline">
                Add first record →
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["WHT ID", "Vendor", "Invoice Amt", "Rate", "WHT Amount", "Date", "Cert Status"].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">{h}</th>
                  ))}
                  {canManage && <th className="px-5 py-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-[10px] text-accent/70 font-orbitron">{rec.whtId}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-white font-helvetica">{rec.vendorName}</p>
                      {rec.sourceRef && <p className="text-xs text-white/30 font-helvetica">{rec.sourceRef}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{formatNaira(rec.invoiceAmount)}</td>
                    <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{rec.whtRate}%</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-amber-400 font-helvetica">{formatNaira(rec.whtAmount)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatTaxDate(rec.paymentDate)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", WHT_CERT_STYLES[rec.certStatus])}>
                        {rec.certStatus}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleToggleCert(rec)}
                          className={cn("text-xs border px-2.5 py-1 rounded-lg font-helvetica transition-colors",
                            rec.certStatus === "pending"
                              ? "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                              : "text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                          )}
                        >
                          {rec.certStatus === "pending" ? "Mark Issued" : "Mark Pending"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
