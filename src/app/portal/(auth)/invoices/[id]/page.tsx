"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { getInvoice } from "@/lib/finance-service";
import type { Invoice } from "@/types/finance";
import { formatNaira, formatDate, COMPANY } from "@/types/finance";
import { cn } from "@/lib/utils";

export default function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }                          = use(params);
  const [invoice, setInvoice]           = useState<Invoice | null>(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    getInvoice(id).then(setInvoice).finally(() => setLoading(false));
  }, [id]);

  function handlePrint() {
    if (!invoice) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;color:#000;background:#fff;padding:32px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
      .brand{font-weight:900;font-size:22px;color:#003366;letter-spacing:2px}
      .inv-num{font-size:24px;font-weight:bold;color:#FF761B}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th{background:#003366;color:#fff;padding:8px 12px;text-align:left;font-size:12px}
      td{padding:8px 12px;border-bottom:1px solid #eee;font-size:12px}
      .total-row td{font-weight:bold;background:#f5f5f5}
      .section{margin-bottom:20px}
      .label{font-size:10px;color:#666;font-weight:bold;text-transform:uppercase}
      .value{font-size:13px}
    </style>
    </head><body>
    <div class="header">
      <div>
        <div class="brand">CHRONIX TECHNOLOGY LIMITED</div>
        <div style="font-size:11px;color:#555;margin-top:4px">${COMPANY.address}</div>
        <div style="font-size:11px;color:#555">${COMPANY.phone} · ${COMPANY.email}</div>
      </div>
      <div class="inv-num">INVOICE<br/><span style="font-size:16px">${invoice.invoiceNumber}</span></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
      <div class="section">
        <div class="label">Bill To</div>
        <div class="value">${invoice.client.name}</div>
        <div style="font-size:11px;color:#555">${invoice.client.address}</div>
        <div style="font-size:11px;color:#555">${invoice.client.phone}</div>
      </div>
      <div class="section">
        <table style="margin:0"><tr><td class="label">Invoice Date</td><td class="value">${formatDate(invoice.invoiceDate)}</td></tr>
        <tr><td class="label">Due Date</td><td class="value">${formatDate(invoice.dueDate)}</td></tr>
        <tr><td class="label">Status</td><td class="value">${invoice.status.toUpperCase()}</td></tr></table>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>
        ${invoice.items.map((item) => `<tr><td>${item.name}</td><td>${formatNaira(item.unitPrice)}</td><td>${item.quantity}</td><td>${formatNaira(item.lineTotal)}</td></tr>`).join("")}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Subtotal</td><td>${formatNaira(invoice.subtotal)}</td></tr>
        <tr><td colspan="3">VAT (${(invoice.vatRate * 100).toFixed(1)}%)</td><td>${formatNaira(invoice.vatAmount)}</td></tr>
        <tr class="total-row"><td colspan="3"><strong>TOTAL</strong></td><td><strong>${formatNaira(invoice.total)}</strong></td></tr>
      </tfoot>
    </table>
    <div class="section" style="margin-top:24px;padding:12px;background:#f9f9f9;border-radius:4px">
      <div class="label">Bank Details</div>
      <div class="value">${COMPANY.bank.name} · ${COMPANY.bank.account} · ${COMPANY.bank.accountName}</div>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!invoice) {
    return (
      <div className="text-center py-16">
        <p className="text-white/40 font-helvetica">Invoice not found.</p>
        <Link href="/portal/invoices" className="text-accent text-sm hover:underline font-helvetica mt-2 block">← Back to Invoices</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/portal/invoices" className="text-xs text-white/30 hover:text-white font-helvetica transition-colors">
            ← Invoices
          </Link>
          <h1 className="font-orbitron text-xl font-bold text-white mt-1">{invoice.invoiceNumber}</h1>
        </div>
        <button onClick={handlePrint} className="bg-accent hover:bg-accent/90 text-white text-xs font-semibold font-helvetica px-4 py-2 rounded-lg transition-colors">
          Download / Print
        </button>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-5">
        {/* Status + dates */}
        <div className="flex flex-wrap gap-4 items-center">
          <span className={cn("text-xs font-semibold px-3 py-1 rounded-full border font-helvetica",
            invoice.status === "paid"    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
            invoice.status === "overdue" ? "bg-red-500/15 text-red-400 border-red-500/30" :
            "bg-amber-500/15 text-amber-400 border-amber-500/30"
          )}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
          <span className="text-xs text-white/40 font-helvetica">Invoice Date: {formatDate(invoice.invoiceDate)}</span>
          <span className="text-xs text-white/40 font-helvetica">Due: {formatDate(invoice.dueDate)}</span>
        </div>

        {/* Items */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                {["Description", "Unit Price", "Qty", "Total"].map((h) => (
                  <th key={h} className="py-2 px-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 px-3 text-sm text-white font-helvetica">{item.name}</td>
                  <td className="py-3 px-3 text-sm text-white/60 font-helvetica">{formatNaira(item.unitPrice)}</td>
                  <td className="py-3 px-3 text-sm text-white/60 font-helvetica">{item.quantity}</td>
                  <td className="py-3 px-3 text-sm text-white font-semibold font-helvetica">{formatNaira(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-white/10 pt-4 space-y-2 max-w-xs ml-auto">
          <div className="flex justify-between text-sm font-helvetica">
            <span className="text-white/40">Subtotal</span>
            <span className="text-white">{formatNaira(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm font-helvetica">
            <span className="text-white/40">VAT ({(invoice.vatRate * 100).toFixed(1)}%)</span>
            <span className="text-white">{formatNaira(invoice.vatAmount)}</span>
          </div>
          <div className="flex justify-between text-sm font-helvetica font-bold border-t border-white/10 pt-2">
            <span className="text-white">Total</span>
            <span className="text-secondary text-base">{formatNaira(invoice.total)}</span>
          </div>
        </div>

        {/* Bank details */}
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
          <p className="text-xs text-white/30 font-helvetica uppercase tracking-wider mb-2">Payment Details</p>
          <p className="text-sm text-white font-helvetica">{COMPANY.bank.name} · {COMPANY.bank.account}</p>
          <p className="text-xs text-white/40 font-helvetica">{COMPANY.bank.accountName}</p>
        </div>
      </div>
    </div>
  );
}
