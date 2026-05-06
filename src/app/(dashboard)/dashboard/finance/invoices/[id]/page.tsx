"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getInvoice, updateInvoiceStatus, deleteInvoice } from "@/lib/finance-service";
import { formatNaira, formatDate, COMPANY } from "@/types/finance";
import type { Invoice } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, canDeleteUnpaidInvoice } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function InvoiceViewPage() {
  const params  = useParams();
  const router  = useRouter();
  const { profile } = useAuth();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = profile ? hasPermission(profile.role, "manage:finance") : false;
  const canDelete   = profile ? canDeleteUnpaidInvoice(profile.role) : false;

  useEffect(() => {
    if (!id) return;
    getInvoice(id).then(setInvoice).finally(() => setLoading(false));
  }, [id]);

  async function handleMarkPaid() {
    if (!invoice) return;
    await updateInvoiceStatus(invoice.id, "paid");
    setInvoice((prev) => prev ? { ...prev, status: "paid" } : prev);
  }

  async function handleDeleteInvoice() {
    if (!invoice || invoice.status === "paid" || !canDelete) return;
    setDeleting(true);
    try {
      await deleteInvoice(invoice.id);
      router.replace("/dashboard/finance/invoices");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  function handlePrint() {
    if (!invoice) return;
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    win.document.write(buildPrintHtml(invoice));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
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
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica transition-colors"
        >
          <BackIcon /> Back to Invoices
        </button>
        <div className="flex gap-3 flex-wrap justify-end">
          {canManage && invoice.status !== "paid" && (
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
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Status</p>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize font-helvetica", statusStyle)}>
                {invoice.status}
              </span>
            </div>
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
function buildPrintHtml(inv: Invoice): string {
  const rows = inv.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 14px;font-size:13px;">${item.name}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;">${item.unitPrice.toLocaleString("en-NG")}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 14px;font-size:13px;text-align:right;font-weight:600;">${item.lineTotal.toLocaleString("en-NG")}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${inv.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:Arial,Helvetica,sans-serif;
      color:#0f172a;
      background:#fff;
      padding:28px 30px;
      font-size:12px;
    }
    .page{
      border:1px solid #d8e0eb;
      border-radius:8px;
      overflow:hidden;
    }
    .top-strip{height:6px;background:#ff761b;}
    .content{padding:22px 24px 20px;}
    .header{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:20px;
      margin-bottom:18px;
    }
    .brand-mark{
      font-family:'Orbitron',Arial,sans-serif;
      font-size:22px;
      font-weight:900;
      letter-spacing:0.8px;
      line-height:1;
      color:#0b2f5e;
    }
    .brand-sub{
      font-size:9.5px;
      color:#6b7280;
      letter-spacing:1px;
      text-transform:uppercase;
      margin-top:1px;
    }
    .company-text{
      margin-top:9px;
      font-size:11px;
      color:#334155;
      line-height:1.45;
    }
    .invoice-pane{
      text-align:right;
      min-width:220px;
    }
    .invoice-title{
      font-family:'Orbitron',Arial,sans-serif;
      font-size:30px;
      font-weight:900;
      color:#0b2f5e;
      letter-spacing:2px;
      line-height:1;
    }
    .invoice-meta{
      margin-top:10px;
      font-size:11px;
      color:#334155;
      line-height:1.6;
    }
    .invoice-meta b{color:#0f172a;}
    .meta-row{
      display:grid;
      grid-template-columns:1.2fr 0.8fr;
      gap:20px;
      margin-bottom:14px;
    }
    .label{
      font-size:9.5px;
      color:#64748b;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:0.8px;
      margin-bottom:4px;
    }
    .value{font-size:12px;color:#0f172a;line-height:1.45}
    .value .name{font-size:13px;font-weight:700;color:#0b2f5e}
    table{width:100%;border-collapse:collapse}
    .items{
      border:1px solid #d8e0eb;
      border-radius:6px;
      overflow:hidden;
    }
    .items thead tr{background:#0b2f5e;color:#fff}
    .items th{
      padding:8px 10px;
      font-size:9.5px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:0.8px;
      text-align:left;
    }
    .items th:nth-child(2), .items th:nth-child(4){text-align:right}
    .items th:nth-child(3){text-align:center}
    .items td{
      padding:7px 10px;
      border-bottom:1px solid #e7edf6;
      font-size:11.5px;
      line-height:1.35;
    }
    .items td:nth-child(2), .items td:nth-child(4){text-align:right}
    .items td:nth-child(3){text-align:center}
    .items tbody tr:last-child td{border-bottom:none}
    .summary{
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:14px;
      margin-top:14px;
    }
    .bank{
      flex:1;
      border:1px solid #d8e0eb;
      border-radius:6px;
      overflow:hidden;
    }
    .bank thead tr{background:#0b2f5e;color:#fff}
    .bank th{
      padding:7px 8px;
      font-size:9px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:0.6px;
      text-align:left;
    }
    .bank td{
      padding:9px 8px;
      font-size:10.5px;
      color:#1f2937;
    }
    .totals{width:250px}
    .t-row{
      display:flex;
      justify-content:space-between;
      padding:3px 0;
      font-size:12px;
      color:#0f172a;
    }
    .t-total{
      display:flex;
      justify-content:space-between;
      margin-top:5px;
      padding-top:6px;
      border-top:1.5px solid #cdd8e6;
      font-size:15px;
      font-weight:700;
      color:#0b2f5e;
    }
    .t-total span:last-child{color:#ff761b}
    .notes{
      margin-top:10px;
      padding:8px 10px;
      font-size:11px;
      color:#334155;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:6px;
    }
    .footer{
      margin-top:14px;
      padding-top:10px;
      border-top:1px solid #d8e0eb;
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-size:10px;
      color:#64748b;
    }
    .thanks{
      font-family:'Orbitron',Arial,sans-serif;
      font-weight:700;
      letter-spacing:1.3px;
      text-transform:uppercase;
      margin:0 auto;
      color:#475569;
    }
    @media print{body{padding:0}.page{border:none;border-radius:0}}
  </style>
</head>
<body>
  <div class="page">
    <div class="top-strip"></div>
    <div class="content">
      <div class="header">
        <div>
          <div class="brand-mark">Chronix Tech</div>
          <div class="brand-sub">Chronix Technology Limited</div>
          <div class="company-text">
            ${COMPANY.address}<br/>
            ${COMPANY.phone}<br/>
            ${COMPANY.website}<br/>
            ${COMPANY.email}
          </div>
        </div>
        <div class="invoice-pane">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-meta">
            <div><b>INVOICE NO</b> ${inv.invoiceNumber}</div>
            <div><b>INVOICE DATE</b> ${formatDate(inv.invoiceDate)}</div>
            <div><b>DUE DATE</b> ${formatDate(inv.dueDate)}</div>
          </div>
        </div>
      </div>

      <div class="meta-row">
        <div>
          <div class="label">Invoice To</div>
          <div class="value">
            <div class="name">${inv.client.name}</div>
            <div>Address: ${inv.client.address}</div>
            <div>Phone: ${inv.client.phone}</div>
          </div>
        </div>
        <div>
          <div class="label">Salesperson</div>
          <div class="value">${inv.salesperson}</div>
          <div class="label" style="margin-top:8px;">Status</div>
          <div class="value" style="text-transform:capitalize">${inv.status}</div>
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Unit Price (₦)</th>
            <th>Quantity</th>
            <th>Line Total (₦)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="summary">
        <table class="bank">
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
        <div class="totals">
          <div class="t-row"><span>Subtotal</span><span>₦${inv.subtotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span></div>
          <div class="t-row"><span>VAT (7.5)</span><span>₦${inv.vatAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span></div>
          <div class="t-total"><span>Total</span><span>₦${inv.total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span></div>
        </div>
      </div>

      ${inv.notes ? `<div class="notes"><strong>Notes:</strong> ${inv.notes}</div>` : ""}

      <div class="footer">
        <span>${new Date().toLocaleDateString("en-GB")}</span>
        <span class="thanks">THANK YOU FOR YOUR BUSINESS!</span>
        <span></span>
      </div>
    </div>
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
