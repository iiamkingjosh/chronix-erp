"use client";

import { useEffect, useState } from "react";
import {
  getWHTRecords, createWHTRecord, updateWHTCertStatus, updateWHTRecord,
  markWHTPaid, deleteWHTRecord,
} from "@/lib/tax-service";
import { generateWHTId, WHT_CERT_STYLES, formatTaxDate, currentPeriod } from "@/types/tax";
import type { WHTRecord } from "@/types/tax";
import { getInvoices } from "@/lib/finance-service";
import { formatNaira } from "@/types/finance";
import type { Invoice } from "@/types/finance";
import { EXPENSE_CATEGORY_LABELS } from "@/types/expense";
import type { ExpenseCategory } from "@/types/expense";
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
  const headers = ["WHT ID", "Vendor", "Invoice Amount (NGN)", "WHT Rate (%)", "WHT Amount (NGN)", "Status", "Bill Date", "Payment Date", "Cert Status", "Source Ref", "Notes"];
  const rows = records.map((r) => [
    r.whtId, r.vendorName, r.invoiceAmount, r.whtRate, r.whtAmount,
    r.status, r.billDate, r.paymentDate ?? "", r.certStatus, r.sourceRef ?? "", r.notes ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `wht-${period}.csv`);
}

function doExportXLS(records: WHTRecord[], period: string) {
  const esc = (s: string | number) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const type = (v: string | number) => (typeof v === "number" ? "Number" : "String");
  const headers = ["WHT ID", "Vendor", "Invoice Amount (NGN)", "WHT Rate (%)", "WHT Amount (NGN)", "Status", "Bill Date", "Payment Date", "Cert Status", "Source Ref", "Notes"];
  const rows = records.map((r) => [
    r.whtId, r.vendorName, r.invoiceAmount, r.whtRate, r.whtAmount,
    r.status, r.billDate, r.paymentDate ?? "", r.certStatus, r.sourceRef ?? "", r.notes ?? "",
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
        `<tr><td>${r.whtId}</td><td>${r.vendorName}</td><td class="num">₦${r.invoiceAmount.toLocaleString()}</td><td class="ctr">${r.whtRate}%</td><td class="num">₦${r.whtAmount.toLocaleString()}</td><td>${r.paymentDate ?? r.billDate + " (pending)"}</td><td>${r.certStatus}</td></tr>`,
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
    category: "other" as ExpenseCategory,
    billDate: new Date().toISOString().split("T")[0],
    sourceRef: "", notes: "",
  });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [payingId, setPayingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");

  // Detail / edit modal
  const [detailRec, setDetailRec]       = useState<WHTRecord | null>(null);
  const [modalNotes, setModalNotes]     = useState("");
  const [modalSaving, setModalSaving]   = useState(false);
  const [modalError, setModalError]     = useState<string | null>(null);

  const canManage     = profile ? hasPermission(profile.role, "manage:tax") : false;
  const periodOptions = buildPeriodOptions();

  useEffect(() => {
    Promise.all([getWHTRecords(), getInvoices()])
      .then(([recs, invs]) => {
        setAllRecords(recs);
        setInvoices(invs.filter((i) => i.status === "paid" || i.approvalStatus === "approved"));
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredRecords = allRecords.filter((r) => (r.paymentDate ?? r.billDate).startsWith(period));
  const whtAmount       = (Number(form.invoiceAmount) || 0) * (Number(form.whtRate) || 0) / 100;
  const totalWHT        = filteredRecords.reduce((s, r) => s + r.whtAmount, 0);
  const pending         = filteredRecords.filter((r) => r.certStatus === "pending").length;
  const issued          = filteredRecords.filter((r) => r.certStatus === "issued").length;

  function openDetail(rec: WHTRecord) {
    setDetailRec(rec);
    setModalNotes(rec.notes ?? "");
    setModalError(null);
  }

  function closeDetail() {
    setDetailRec(null);
    setModalNotes("");
    setModalError(null);
    setModalSaving(false);
  }

  async function handleSaveNotes() {
    if (!detailRec || !profile) return;
    setModalSaving(true);
    setModalError(null);
    try {
      await updateWHTRecord(detailRec.id, { notes: modalNotes.trim() || undefined });
      const updated = { ...detailRec, notes: modalNotes.trim() || undefined };
      setAllRecords((prev) => prev.map((r) => r.id === detailRec.id ? updated : r));
      setDetailRec(updated);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "invoices", entityId: detailRec.id, entityRef: detailRec.whtId, details: `WHT record notes updated`, timestamp: new Date().toISOString() });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to save notes");
    } finally { setModalSaving(false); }
  }

  async function handleMarkError() {
    if (!detailRec || !profile) return;
    setModalSaving(true);
    setModalError(null);
    const existing = detailRec.notes?.trim();
    const errorNote = existing && !existing.startsWith("LOGGED IN ERROR")
      ? `LOGGED IN ERROR — ${existing}`
      : "LOGGED IN ERROR";
    try {
      await updateWHTRecord(detailRec.id, { notes: errorNote });
      const updated = { ...detailRec, notes: errorNote };
      setAllRecords((prev) => prev.map((r) => r.id === detailRec.id ? updated : r));
      setDetailRec(updated);
      setModalNotes(errorNote);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "invoices", entityId: detailRec.id, entityRef: detailRec.whtId, details: `WHT record flagged as logged in error`, timestamp: new Date().toISOString() });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to flag record");
    } finally { setModalSaving(false); }
  }

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
        category:      form.category,
        status:        "pending",
        billDate:      form.billDate,
        ...(form.sourceRef.trim() ? { sourceRef: form.sourceRef.trim() } : {}),
        ...(form.notes.trim()     ? { notes:     form.notes.trim()     } : {}),
        certStatus:    "pending",
        createdAt:     new Date().toISOString(),
        createdBy:     profile.uid,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "invoices", entityId: rec.id, entityRef: rec.whtId, details: `WHT bill logged (unpaid): ₦${rec.whtAmount.toLocaleString()} WHT on ${rec.vendorName}`, timestamp: new Date().toISOString() });

      // No journal entry here — this is just a record. Nothing posts to the
      // ledger until handleMarkPaid() actually pays it, same as an invoice
      // doesn't post until a payment is recorded against it.

      setAllRecords((prev) => [rec, ...prev]);
      setShowForm(false);
      setSelectedInvoiceId("");
      setForm({ vendorName: "", invoiceAmount: "", whtRate: String(DEFAULT_WHT_RATE), category: "other", billDate: new Date().toISOString().split("T")[0], sourceRef: "", notes: "" });

      auth.currentUser?.getIdToken().then((idToken) => {
        fetch("/api/notifications/send", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body:    JSON.stringify({
            type:        "wht_remittance_due",
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

  async function handleMarkPaid(e: React.MouseEvent, rec: WHTRecord) {
    e.stopPropagation();
    if (!profile || rec.status === "paid") return;
    setPayingId(rec.id);
    try {
      await markWHTPaid(rec.id, profile.uid, { invoiceNumber: rec.sourceRef });
      const paymentDate = new Date().toISOString().split("T")[0];
      setAllRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, status: "paid", paymentDate } : r));
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "invoices", entityId: rec.id, entityRef: rec.whtId, details: `WHT bill marked paid — ₦${rec.whtAmount.toLocaleString()} withheld from ${rec.vendorName}`, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[WHT] mark paid failed:", err);
    } finally { setPayingId(null); }
  }

  async function handleDelete(e: React.MouseEvent, rec: WHTRecord) {
    e.stopPropagation();
    if (rec.status === "paid") return;
    if (!confirm(`Delete this WHT bill for ${rec.vendorName}? This cannot be undone.`)) return;
    setDeletingId(rec.id);
    try {
      await deleteWHTRecord(rec.id);
      setAllRecords((prev) => prev.filter((r) => r.id !== rec.id));
      if (profile) {
        logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "delete", module: "invoices", entityId: rec.id, entityRef: rec.whtId, details: `WHT bill for ${rec.vendorName} deleted (was never paid — no ledger impact)`, timestamp: new Date().toISOString() });
      }
    } catch (err) {
      console.error("[WHT] delete failed:", err);
    } finally { setDeletingId(null); }
  }

  async function handleToggleCert(e: React.MouseEvent, rec: WHTRecord) {
    e.stopPropagation();
    const next = rec.certStatus === "pending" ? "issued" : "pending";
    await updateWHTCertStatus(rec.id, next);
    setAllRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, certStatus: next } : r));
    if (detailRec?.id === rec.id) setDetailRec((prev) => prev ? { ...prev, certStatus: next } : prev);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">

      {/* Detail / edit modal */}
      {detailRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeDetail}>
          <div className="surface-card w-full max-w-lg p-6 mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="font-orbitron text-xs font-semibold text-accent tracking-widest">{detailRec.whtId}</p>
                <h3 className="font-orbitron text-sm font-bold text-white mt-0.5">{detailRec.vendorName}</h3>
              </div>
              <div className="flex items-center gap-2">
                {detailRec.notes?.startsWith("LOGGED IN ERROR") ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30 font-helvetica">Error</span>
                ) : (
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", WHT_CERT_STYLES[detailRec.certStatus])}>
                    {detailRec.certStatus}
                  </span>
                )}
                <button onClick={closeDetail} className="text-white/30 hover:text-white ml-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5 text-sm font-helvetica">
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Invoice Amount</p>
                <p className="text-white">{formatNaira(detailRec.invoiceAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">WHT Amount</p>
                <p className="text-amber-400 font-semibold">{formatNaira(detailRec.whtAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">WHT Rate</p>
                <p className="text-white">{detailRec.whtRate}%</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">{detailRec.status === "paid" ? "Payment Date" : "Bill Date"}</p>
                <p className="text-white">{formatTaxDate(detailRec.paymentDate ?? detailRec.billDate)}</p>
                {detailRec.status === "pending" && <p className="text-[10px] text-white/30 mt-0.5">Not yet paid — not in the ledger</p>}
              </div>
              {detailRec.sourceRef && (
                <div className="col-span-2">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Source Ref</p>
                  <p className="text-white/70">{detailRec.sourceRef}</p>
                </div>
              )}
            </div>

            {/* Notes editor */}
            <div className="mb-4">
              <label className="field-label">Notes</label>
              <textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about this WHT record…"
                className="input-field resize-none"
                disabled={!canManage}
              />
            </div>

            {modalError && (
              <p className="text-red-400 text-xs font-helvetica mb-3">{modalError}</p>
            )}

            {/* Actions */}
            {canManage && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSaveNotes}
                  disabled={modalSaving}
                  className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
                >
                  {modalSaving ? "Saving…" : "Save Notes"}
                </button>
                <button
                  onClick={() => handleToggleCert({ stopPropagation: () => {} } as React.MouseEvent, detailRec)}
                  disabled={modalSaving}
                  className={cn(
                    "text-xs border px-3 py-2 rounded-lg font-helvetica transition-colors disabled:opacity-50",
                    detailRec.certStatus === "pending"
                      ? "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                      : "text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                  )}
                >
                  {detailRec.certStatus === "pending" ? "Mark Issued" : "Mark Pending"}
                </button>
                {!detailRec.notes?.startsWith("LOGGED IN ERROR") && (
                  <button
                    onClick={handleMarkError}
                    disabled={modalSaving}
                    className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-lg font-helvetica transition-colors disabled:opacity-50 ml-auto"
                  >
                    Mark as Error
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
            <p className="text-white/30 text-xs font-helvetica">5% services &amp; contracts · 2.5% goods/products · 10% rent, dividends &amp; interest</p>
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

          {/* Invoice auto-fill */}
          <div className="mb-5 p-4 bg-secondary/5 border border-secondary/15 rounded-xl">
            <label className="field-label">Auto-fill from Invoice (optional)</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => {
                const inv = invoices.find((i) => i.id === e.target.value);
                setSelectedInvoiceId(e.target.value);
                if (inv) {
                  setForm((p) => ({
                    ...p,
                    vendorName:    inv.client.name,
                    invoiceAmount: String(Math.round(inv.subtotal || inv.total / 1.075)),
                    sourceRef:     inv.invoiceNumber,
                  }));
                }
              }}
              className="input-field"
            >
              <option value="">— Select an invoice to auto-fill fields below —</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id} className="bg-primary-dark">
                  {inv.invoiceNumber} · {inv.client.name} · {formatNaira(inv.subtotal || inv.total)}
                </option>
              ))}
            </select>
            {selectedInvoiceId && (
              <p className="mt-1.5 text-[10px] text-secondary/70 font-helvetica">
                Fields pre-filled — you can still edit them below before saving.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="field-label">Vendor / Client Name</label>
              <input value={form.vendorName} onChange={(e) => setForm((p) => ({ ...p, vendorName: e.target.value }))} placeholder="e.g. Vendor Ltd" className="input-field" />
            </div>
            <div>
              <label className="field-label">Invoice Amount (₦)</label>
              <input type="number" min="0" value={form.invoiceAmount} onChange={(e) => setForm((p) => ({ ...p, invoiceAmount: e.target.value }))} placeholder="0.00" className="input-field" />
            </div>
            <div>
              <label className="field-label">WHT Rate (%)</label>
              <input type="number" min="0" max="20" step="0.5" value={form.whtRate} onChange={(e) => setForm((p) => ({ ...p, whtRate: e.target.value }))} className="input-field" />
              <p className="mt-1 text-[10px] text-white/20 font-helvetica">5% services &amp; contracts · 2.5% goods/products · 10% rent, dividends, interest</p>
            </div>
            <div>
              <label className="field-label">WHT Amount (auto)</label>
              <div className="input-field bg-white/[0.02] text-secondary font-semibold">{formatNaira(whtAmount)}</div>
            </div>
            <div>
              <label className="field-label">Bill Date</label>
              <input type="date" value={form.billDate} onChange={(e) => setForm((p) => ({ ...p, billDate: e.target.value }))} className="input-field" />
              <p className="mt-1 text-[10px] text-white/20 font-helvetica">When you got the bill — not when you&apos;ll pay it. Logging doesn&apos;t touch the books.</p>
            </div>
            <div>
              <label className="field-label">Expense Category</label>
              <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as ExpenseCategory }))} className="input-field">
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value} className="bg-primary-dark">{label}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-white/20 font-helvetica">Which account this posts to once it&apos;s actually paid.</p>
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
            <button onClick={() => { setShowForm(false); setSelectedInvoiceId(""); }} className="text-xs text-white/40 hover:text-white font-helvetica transition-colors px-3">Cancel</button>
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
                  {["WHT ID", "Vendor", "Invoice Amt", "Rate", "WHT Amount", "Status", "Date", "Cert Status"].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">{h}</th>
                  ))}
                  {canManage && <th className="px-5 py-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRecords.map((rec) => {
                  const isError = rec.notes?.startsWith("LOGGED IN ERROR");
                  return (
                    <tr
                      key={rec.id}
                      onClick={() => openDetail(rec)}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5 text-[10px] text-accent/70 font-orbitron">{rec.whtId}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-white font-helvetica">{rec.vendorName}</p>
                        {rec.sourceRef && <p className="text-xs text-white/30 font-helvetica">{rec.sourceRef}</p>}
                        {rec.notes && !isError && (
                          <p className="text-[10px] text-white/20 font-helvetica truncate max-w-[180px]">{rec.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{formatNaira(rec.invoiceAmount)}</td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{rec.whtRate}%</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-amber-400 font-helvetica">{formatNaira(rec.whtAmount)}</td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize",
                          rec.status === "paid"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-white/5 text-white/50 border-white/10"
                        )}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatTaxDate(rec.paymentDate ?? rec.billDate)}</td>
                      <td className="px-5 py-3.5">
                        {isError ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30 font-helvetica">
                            Error
                          </span>
                        ) : (
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", WHT_CERT_STYLES[rec.certStatus])}>
                            {rec.certStatus}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {rec.status === "pending" && (
                              <button
                                onClick={(e) => handleMarkPaid(e, rec)}
                                disabled={payingId === rec.id}
                                className="text-xs border px-2.5 py-1 rounded-lg font-helvetica transition-colors text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 disabled:opacity-40"
                              >
                                {payingId === rec.id ? "Posting…" : "Mark Paid"}
                              </button>
                            )}
                            <button
                              onClick={(e) => handleToggleCert(e, rec)}
                              className={cn("text-xs border px-2.5 py-1 rounded-lg font-helvetica transition-colors",
                                rec.certStatus === "pending"
                                  ? "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                                  : "text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                              )}
                            >
                              {rec.certStatus === "pending" ? "Mark Issued" : "Mark Pending"}
                            </button>
                            {rec.status === "pending" && (
                              <button
                                onClick={(e) => handleDelete(e, rec)}
                                disabled={deletingId === rec.id}
                                className="text-xs border px-2.5 py-1 rounded-lg font-helvetica transition-colors text-red-400 border-red-500/20 hover:bg-red-500/10 disabled:opacity-40"
                              >
                                {deletingId === rec.id ? "Deleting…" : "Delete"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
