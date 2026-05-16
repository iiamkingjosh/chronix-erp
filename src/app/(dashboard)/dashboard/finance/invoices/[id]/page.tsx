"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getInvoice, updateInvoiceStatus, deleteInvoice, updateInvoiceApproval } from "@/lib/finance-service";
import { auth } from "@/lib/firebase";
import { formatNaira, formatDate, COMPANY, APPROVAL_STATUS_STYLES, APPROVAL_STATUS_LABELS } from "@/types/finance";
import type { Invoice } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission, canDeleteUnpaidInvoice, isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function InvoiceViewPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [rejectModal, setRejectModal]     = useState(false);
  const [rejectReason, setRejectReason]   = useState("");
  const [approving, setApproving]         = useState(false);
  const [sendModal, setSendModal]         = useState(false);
  const [sendEmail, setSendEmail]         = useState("");
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);
  const [downloading, setDownloading]     = useState(false);

  const canManage  = profile ? hasPermission(profile.role, "manage:finance") : false;
  const canDelete  = profile ? canDeleteUnpaidInvoice(profile.role) : false;
  const canApprove = profile ? (isRootAdmin(profile.role) || profile.role === "CFO" || profile.role === "CEO") : false;

  useEffect(() => {
    if (!id) return;
    getInvoice(id).then(setInvoice).finally(() => setLoading(false));
  }, [id]);

  async function handleApprove() {
    if (!invoice || !profile) return;
    setApproving(true);
    try {
      await updateInvoiceApproval(invoice.id, "approved", profile.displayName ?? profile.email);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "approve", module: "invoices", entityId: invoice.id, entityRef: invoice.invoiceNumber, details: `Invoice ${invoice.invoiceNumber} approved`, timestamp: new Date().toISOString() });
      setInvoice((prev) => prev ? { ...prev, approvalStatus: "approved", approvedBy: profile.displayName ?? profile.email, approvedAt: new Date().toISOString() } : prev);
    } finally { setApproving(false); }
  }

  async function handleReject() {
    if (!invoice || !profile || !rejectReason.trim()) return;
    setApproving(true);
    try {
      await updateInvoiceApproval(invoice.id, "rejected", profile.displayName ?? profile.email, { rejectionReason: rejectReason });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "reject", module: "invoices", entityId: invoice.id, entityRef: invoice.invoiceNumber, details: `Invoice ${invoice.invoiceNumber} rejected: ${rejectReason}`, timestamp: new Date().toISOString() });
      setInvoice((prev) => prev ? { ...prev, approvalStatus: "rejected", rejectedBy: profile.displayName ?? profile.email, rejectionReason: rejectReason } : prev);
      setRejectModal(false);
      setRejectReason("");
    } finally { setApproving(false); }
  }

  async function handleMarkPaid() {
    if (!invoice || !profile) return;
    await updateInvoiceStatus(invoice.id, "paid");
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "invoices", entityId: invoice.id, entityRef: invoice.invoiceNumber, details: `Invoice ${invoice.invoiceNumber} marked as paid`, timestamp: new Date().toISOString() });
    setInvoice((prev) => prev ? { ...prev, status: "paid" } : prev);
  }

  async function handleDeleteInvoice() {
    if (!invoice || invoice.status === "paid" || !canDelete || !profile) return;
    setDeleting(true);
    try {
      await deleteInvoice(invoice.id);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "delete", module: "invoices", entityId: invoice.id, entityRef: invoice.invoiceNumber, details: `Invoice ${invoice.invoiceNumber} deleted`, timestamp: new Date().toISOString() });
      router.replace("/dashboard/finance/invoices");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  function handlePrint() {
    if (!invoice) return;
    const win = window.open("", "_blank", "width=860,height=1200");
    if (!win) return;
    win.document.write(buildPrintHtml(invoice, window.location.origin));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 800);
  }

  async function handleDownloadPDF() {
    if (!invoice) return;
    setDownloading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) { alert("Failed to generate PDF"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `invoice-${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  }

  async function handleSendToClient() {
    if (!invoice || !sendEmail.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const res  = await fetch(`/api/invoices/${invoice.id}/send`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body:    JSON.stringify({ clientEmail: sendEmail.trim() }),
      });
      const json = await res.json() as { success?: boolean; error?: string; sentTo?: string };
      if (!res.ok || !json.success) {
        setSendError(json.error ?? "Failed to send invoice");
        return;
      }
      setInvoice((prev) => prev ? { ...prev, sentAt: new Date().toISOString(), sentTo: json.sentTo } : prev);
      setSendModal(false);
      setSendEmail("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send invoice");
    } finally { setSending(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">Invoice not found.</p>
        <button onClick={() => router.back()} className="mt-4 text-accent text-sm hover:underline font-helvetica">
          ← Go back
        </button>
      </div>
    );
  }

  const statusStyle = {
    paid:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    overdue: "bg-red-500/15 text-red-400 border-red-500/30",
  }[invoice.status];

  return (
    <div className="animate-fade-in max-w-4xl">
      {/* Send to Client modal */}
      {sendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-1">Send Invoice to Client</h3>
            <p className="text-xs text-white/40 font-helvetica mb-4">
              A PDF copy of <span className="text-accent">{invoice.invoiceNumber}</span> will be emailed as an attachment.
            </p>
            <label className="field-label">Client Email Address</label>
            <input
              type="email"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
              placeholder="client@example.com"
              className="input-field mb-1"
              autoFocus
            />
            {invoice.sentAt && (
              <p className="text-[10px] text-white/30 font-helvetica mb-3">
                Previously sent to {invoice.sentTo} on {new Date(invoice.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {sendError && <p className="text-xs text-red-400 font-helvetica mt-1 mb-2">{sendError}</p>}
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => { setSendModal(false); setSendEmail(""); setSendError(null); }} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleSendToClient} disabled={!sendEmail.trim() || sending} className="btn-primary text-xs px-5 disabled:opacity-50">
                {sending ? "Sending…" : "Send Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-6 mx-4">
            <h3 className="font-orbitron text-sm font-bold text-white mb-4">Reject Invoice</h3>
            <label className="field-label">Reason for rejection</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Explain why this invoice is being rejected…"
              className="input-field resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRejectModal(false); setRejectReason(""); }} className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || approving} className="btn-primary text-xs px-5">
                {approving ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica transition-colors"
        >
          <BackIcon /> Back to Invoices
        </button>
        <div className="flex gap-3 flex-wrap justify-end">
          {/* Approval actions */}
          {canApprove && invoice.approvalStatus === "pending_approval" && (
            <>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/10 font-helvetica transition-colors disabled:opacity-50"
              >
                <CheckIcon /> Approve
              </button>
              <button
                onClick={() => setRejectModal(true)}
                disabled={approving}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 font-helvetica transition-colors disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {canManage && invoice.status !== "paid" && invoice.approvalStatus !== "draft" && (
            <button
              onClick={handleMarkPaid}
              className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/10 font-helvetica transition-colors"
            >
              <CheckIcon /> Mark as Paid
            </button>
          )}
          {canDelete && invoice.status !== "paid" && (
            !deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 font-helvetica transition-colors"
              >
                Delete invoice
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-red-300 font-helvetica">Delete this unpaid invoice?</span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteInvoice}
                  className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg font-helvetica disabled:opacity-50"
                >
                  {deleting ? "…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-white/50 hover:text-white font-helvetica px-2"
                >
                  Cancel
                </button>
              </div>
            )
          )}
          {canManage && (
            <>
              <button
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-secondary border border-secondary/30 rounded-xl hover:bg-secondary/10 font-helvetica transition-colors disabled:opacity-50"
              >
                <DownloadIcon /> {downloading ? "Generating…" : "Download PDF"}
              </button>
              <button
                onClick={() => { setSendModal(true); setSendEmail(invoice.client.email ?? ""); }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-accent border border-accent/30 rounded-xl hover:bg-accent/10 font-helvetica transition-colors"
              >
                <SendIcon /> Send to Client
              </button>
            </>
          )}
          <button onClick={handlePrint} className="btn-primary">
            <PrintIcon /> Print Invoice
          </button>
        </div>
      </div>

      {/* Invoice card */}
      <div className="surface-card overflow-hidden">
        {/* Header band */}
        <div className="bg-secondary/20 border-b border-white/10 px-8 py-5 flex items-start justify-between gap-6">
          <div>
            <p className="font-orbitron text-2xl font-black text-white tracking-wide">INVOICE</p>
            <p className="font-orbitron text-sm font-bold text-accent mt-1">{invoice.invoiceNumber}</p>
          </div>
          <div className="text-right">
            <p className="font-orbitron text-sm font-bold text-white">{COMPANY.name}</p>
            <p className="text-white/50 text-xs font-helvetica mt-1">{COMPANY.address}</p>
            <p className="text-white/50 text-xs font-helvetica">{COMPANY.phone}</p>
            <p className="text-white/50 text-xs font-helvetica">{COMPANY.email}</p>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Meta row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Invoice Date</p>
              <p className="text-sm text-white font-helvetica">{formatDate(invoice.invoiceDate)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Due Date</p>
              <p className="text-sm text-white font-helvetica">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Salesperson</p>
              <p className="text-sm text-white font-helvetica">{invoice.salesperson}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Payment Status</p>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize font-helvetica", statusStyle)}>
                {invoice.status}
              </span>
            </div>
            {invoice.approvalStatus && (
              <div>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Approval</p>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", APPROVAL_STATUS_STYLES[invoice.approvalStatus])}>
                  {APPROVAL_STATUS_LABELS[invoice.approvalStatus]}
                </span>
                {invoice.approvalStatus === "rejected" && invoice.rejectionReason && (
                  <p className="text-[10px] text-red-300/70 font-helvetica mt-1">{invoice.rejectionReason}</p>
                )}
              </div>
            )}
          </div>

          {/* Bill to */}
          <div className="mb-8">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-2">Bill To</p>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4">
              <p className="text-white font-semibold font-helvetica">{invoice.client.name}</p>
              <p className="text-white/50 text-sm font-helvetica mt-0.5">{invoice.client.address}</p>
              <p className="text-white/50 text-sm font-helvetica">{invoice.client.phone}</p>
            </div>
          </div>

          {/* Items table */}
          <div className="mb-8">
            <div className="rounded-xl overflow-hidden border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/20">
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-white/70 uppercase tracking-wider font-helvetica">Item</th>
                    <th className="px-5 py-3 text-right text-[10px] font-bold text-white/70 uppercase tracking-wider font-helvetica">Unit Price (₦)</th>
                    <th className="px-5 py-3 text-center text-[10px] font-bold text-white/70 uppercase tracking-wider font-helvetica">Qty</th>
                    <th className="px-5 py-3 text-right text-[10px] font-bold text-white/70 uppercase tracking-wider font-helvetica">Line Total (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-sm text-white font-helvetica">{item.name}</td>
                      <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica text-right">
                        {item.unitPrice.toLocaleString("en-NG")}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica text-center">{item.quantity}</td>
                      <td className="px-5 py-3.5 text-sm text-white font-helvetica font-medium text-right">
                        {item.lineTotal.toLocaleString("en-NG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals + bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Bank details */}
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-3">Payment Details</p>
              <div className="rounded-xl overflow-hidden border border-white/10">
                <table className="w-full text-xs font-helvetica">
                  <thead>
                    <tr className="bg-secondary/20">
                      {["Account Name", "Account No.", "TIN", "Bank"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-bold text-white/70 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-3 text-white/70">{COMPANY.bank.accountName}</td>
                      <td className="px-4 py-3 text-white/70">{COMPANY.bank.account}</td>
                      <td className="px-4 py-3 text-white/70">{COMPANY.bank.tin}</td>
                      <td className="px-4 py-3 text-white/70">{COMPANY.bank.name}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="sm:text-right">
              <div className="inline-block w-full sm:w-64 space-y-2">
                <div className="flex justify-between text-sm font-helvetica">
                  <span className="text-white/50">Subtotal</span>
                  <span className="text-white">{formatNaira(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-helvetica">
                  <span className="text-white/50">VAT (7.5%)</span>
                  <span className="text-white">{formatNaira(invoice.vatAmount)}</span>
                </div>
                <div className="border-t border-white/20 pt-2 flex justify-between">
                  <span className="font-orbitron text-sm font-bold text-white">Total</span>
                  <span className="font-orbitron text-sm font-bold text-accent">{formatNaira(invoice.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Notes</p>
              <p className="text-sm text-white/50 font-helvetica">{invoice.notes}</p>
            </div>
          )}

          <p className="mt-8 text-center font-orbitron text-xs font-bold text-white/30 tracking-widest uppercase">
            Thank You For Your Business!
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Print HTML generator ── */
function buildPrintHtml(inv: Invoice, _origin: string): string {
  const logoUrl      = "/images/invoice-logo.png";
  const watermarkUrl = "/images/invoice-watermark.png";

  const fmt = (n: number) =>
    n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = inv.items
    .map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${fmt(item.unitPrice)}</td>
        <td>${item.quantity}</td>
        <td>${fmt(item.lineTotal)}</td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${inv.invoiceNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Barlow', Arial, sans-serif;
      background: #e8e8e8;
      display: flex;
      justify-content: center;
      padding: 32px 16px;
      min-height: 100vh;
    }

    /* ── PAGE ── */
    .page {
      width: 794px;
      min-height: 1123px;
      background: #fff;
      position: relative;
      overflow: visible;
      flex-shrink: 0;
      padding: 28px 40px 0 40px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
    }

    /* ── HEADER ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
      position: relative;
      z-index: 1;
    }
    .header-left h1 {
      font-family: 'Barlow Condensed', 'Arial Black', Arial, sans-serif;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #111;
      text-transform: uppercase;
    }
    .header-right { text-align: left; max-width: 300px; }
    .company-logo-wrap { margin-bottom: 4px; }
    .company-logo-wrap img { height: 40px; width: auto; }
    .company-name {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.3px;
      color: #111;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .company-address { font-size: 10.5px; color: #222; line-height: 1.6; }

    /* ── INVOICE NO + DATE ── */
    .invoice-meta {
      display: flex;
      align-items: flex-end;
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    .invoice-date { font-size: 12px; font-weight: 700; color: #1a5fb4; flex: 0 0 auto; padding-left: 4px; }
    .invoice-number-block {
      text-align: center;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    .invoice-number-block .lbl {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #111;
    }
    .invoice-number-block .val { font-size: 12px; font-weight: 700; color: #1a5fb4; }

    /* ── INVOICE TO ── */
    .invoice-to { margin-bottom: 14px; position: relative; z-index: 1; }
    .invoice-to .section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #111;
      margin-bottom: 3px;
    }
    .invoice-to p { font-size: 11px; color: #222; line-height: 1.6; }

    /* ── META BAR ── */
    .meta-bar {
      display: grid;
      grid-template-columns: 200px 1fr 150px;
      border: 2px solid #aaa;
      margin-bottom: 14px;
      position: relative;
      z-index: 1;
    }
    .meta-bar .cell { padding: 5px 10px; }
    .meta-bar .cell-left { border-right: 2px solid #aaa; }
    .meta-bar .cell-right { text-align: right; border-left: 2px solid #aaa; }
    .meta-bar .cell-label {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #1a5fb4;
      margin-bottom: 2px;
    }
    .meta-bar .cell-value { font-size: 11.5px; font-weight: 600; color: #222; }

    /* ── TABLE COLUMN HEADERS ── */
    .table-header-row {
      display: grid;
      grid-template-columns: 1fr 140px 85px 125px;
      padding: 6px 10px;
      position: relative;
      z-index: 1;
      border-bottom: 2.5px solid #111;
      margin-bottom: 6px;
    }
    .table-header-row span {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #111;
    }
    .table-header-row span:not(:first-child) { text-align: right; }

    /* ── ITEMS TABLE ── */
    .items-wrapper { border: 2px solid #999; margin-bottom: 0; position: relative; z-index: 1; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table tbody tr td { font-size: 11px; font-weight: 700; padding: 5px 10px; color: #111; }
    .items-table tbody tr td:first-child { text-align: left; }
    .items-table tbody tr td:not(:first-child) { text-align: right; }

    /* ── TOTALS ── */
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 12px; position: relative; z-index: 1; }
    .totals-box { width: 270px; border: 2px solid #999; border-top: none; }
    .totals-box .t-line {
      display: grid;
      grid-template-columns: 1fr 2px 1fr;
      align-items: stretch;
      font-size: 11.5px;
      color: #111;
      border-bottom: 1px solid #ddd;
    }
    .totals-box .t-line .t-lbl { padding: 5px 12px; font-weight: 600; color: #111; }
    .totals-box .t-line .t-amt { padding: 5px 12px; text-align: right; font-weight: 700; }
    .totals-box .t-line:last-child { border-bottom: none; font-weight: 800; }
    .totals-box .t-divider { width: 2px; background: #999; align-self: stretch; }

    /* ── BANK TABLE ── */
    .bank-table { width: 100%; border-collapse: collapse; margin-bottom: 0; position: relative; z-index: 1; }
    .bank-table th {
      font-size: 10px;
      font-weight: 800;
      color: #1a5fb4;
      padding: 5px 10px;
      border: 2px solid #999;
      background: #f5f5f5;
      text-align: left;
    }
    .bank-table td { font-size: 11px; font-weight: 600; padding: 5px 10px; border: 2px solid #999; color: #222; }

    /* ── NOTES ── */
    .notes { margin-bottom: 6px; padding: 6px 10px; font-size: 10.5px; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; position: relative; z-index: 1; }

    /* ── THANK YOU ── */
    .thank-you-text { padding: 12px 0 8px 0; position: relative; z-index: 1; }
    .thank-you-text span {
      font-family: 'Barlow Condensed', 'Arial Black', Arial, sans-serif;
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #111;
    }

    /* ── WATERMARK LOGO ── */
    .bottom-logo {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 320px;
      z-index: 2;
      opacity: 0.18;
      pointer-events: none;
    }
    .bottom-logo img { width: 100%; height: auto; display: block; }

    /* ── FOOTER ── */
    .footer {
      background: #e85d04;
      margin: 0 -40px 0 -40px;
      height: 20px;
      position: relative;
      z-index: 3;
      margin-top: auto;
    }

    @media print {
      body { background: white; padding: 0; }
      .page { box-shadow: none; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER: "INVOICE" left, logo + company right -->
  <div class="header">
    <div class="header-left"><h1>Invoice</h1></div>
    <div class="header-right">
      <div class="company-logo-wrap">
        <img src="${logoUrl}" alt="${COMPANY.name}"/>
      </div>
      <div class="company-name">${COMPANY.name}</div>
      <div class="company-address">
        ${COMPANY.address}<br>
        ${COMPANY.phone}<br>
        ${COMPANY.website}<br>
        ${COMPANY.email}
      </div>
    </div>
  </div>

  <!-- DATE (left) · INVOICE NO (centre) -->
  <div class="invoice-meta">
    <div class="invoice-date">${formatDate(inv.invoiceDate)}</div>
    <div class="invoice-number-block">
      <div class="lbl">Invoice No</div>
      <div class="val">${inv.invoiceNumber}</div>
    </div>
  </div>

  <!-- INVOICE TO -->
  <div class="invoice-to">
    <div class="section-title">Invoice To</div>
    <p>
      ${inv.client.name}<br>
      ${inv.client.address ? "Address: " + inv.client.address + "<br>" : ""}${inv.client.phone ? "Phone: " + inv.client.phone : ""}
    </p>
  </div>

  <!-- META BAR: Salesperson | (centre empty) | Due Date -->
  <div class="meta-bar">
    <div class="cell cell-left">
      <div class="cell-label">Salesperson</div>
      <div class="cell-value">${inv.salesperson}</div>
    </div>
    <div class="cell"></div>
    <div class="cell cell-right">
      <div class="cell-label">Due Date</div>
      <div class="cell-value">${formatDate(inv.dueDate)}</div>
    </div>
  </div>

  <!-- TABLE COLUMN HEADERS (separate from the items wrapper) -->
  <div class="table-header-row">
    <span>Item</span>
    <span>Unit Price (₦)</span>
    <span>Quantity</span>
    <span>Line Total (₦)</span>
  </div>

  <!-- ITEMS TABLE inside bordered wrapper -->
  <div class="items-wrapper">
    <table class="items-table">
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- TOTALS (right-aligned box with vertical divider line) -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="t-line">
        <span class="t-lbl">Subtotal</span>
        <span class="t-divider"></span>
        <span class="t-amt">₦ ${fmt(inv.subtotal)}</span>
      </div>
      <div class="t-line">
        <span class="t-lbl">VAT (${(inv.vatRate * 100).toFixed(1)}%)</span>
        <span class="t-divider"></span>
        <span class="t-amt">₦ ${fmt(inv.vatAmount)}</span>
      </div>
      <div class="t-line">
        <span class="t-lbl">Total</span>
        <span class="t-divider"></span>
        <span class="t-amt">₦ ${fmt(inv.total)}</span>
      </div>
    </div>
  </div>

  <!-- BANK DETAILS (full width, blue headers) -->
  <table class="bank-table">
    <thead>
      <tr>
        <th>Account Name</th>
        <th>Account Number</th>
        <th>TIN Number</th>
        <th>Bank Name</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${COMPANY.bank.accountName}</td>
        <td>${COMPANY.bank.account}</td>
        <td>${COMPANY.bank.tin}</td>
        <td>${COMPANY.bank.name}</td>
      </tr>
    </tbody>
  </table>

  ${inv.notes ? `<div class="notes"><strong>Notes:</strong> ${inv.notes}</div>` : ""}

  <!-- THANK YOU -->
  <div class="thank-you-text">
    <span>Thank You For Your Business!</span>
  </div>

  <!-- WATERMARK (bottom-right, 18% opacity) -->
  <div class="bottom-logo">
    <img src="${watermarkUrl}" alt=""/>
  </div>

  <!-- ORANGE FOOTER BAR -->
  <div class="footer"></div>

</div>
</body>
</html>`;
}

function BackIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>;
}
function PrintIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
}
function CheckIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m20 6-11 11-5-5"/></svg>;
}
function DownloadIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function SendIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
