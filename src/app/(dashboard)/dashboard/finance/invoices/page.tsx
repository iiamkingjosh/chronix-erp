"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoices, updateInvoiceStatus, deleteInvoice } from "@/lib/finance-service";
import { checkInvoiceOverdue } from "@/lib/notifications-service";
import { formatNaira, formatDate, APPROVAL_STATUS_STYLES, APPROVAL_STATUS_LABELS } from "@/types/finance";
import type { Invoice, ApprovalStatus } from "@/types/finance";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission, canDeleteUnpaidInvoice } from "@/types/roles";

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize font-helvetica",
        status === "paid"    && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        status === "pending" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
        status === "overdue" && "bg-red-500/15 text-red-400 border-red-500/30"
      )}
    >
      {status}
    </span>
  );
}

type FilterValue = "all" | Invoice["status"] | "draft" | "pending_approval";

export default function InvoicesPage() {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterValue>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:finance") : false;
  const canDelete = profile ? canDeleteUnpaidInvoice(profile.role) : false;

  useEffect(() => {
    getInvoices().then((data) => {
      setInvoices(data);
      checkInvoiceOverdue(data).catch(() => {});
    }).finally(() => setLoading(false));
  }, []);

  async function markStatus(id: string, status: Invoice["status"]) {
    await updateInvoiceStatus(id, status);
    if (profile) {
      const inv = invoices.find((i) => i.id === id);
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "invoices", entityId: id, entityRef: inv?.invoiceNumber, details: `Invoice status changed to ${status}`, timestamp: new Date().toISOString() });
    }
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  async function removeInvoice(id: string) {
    setDeletingId(id);
    try {
      const inv = invoices.find((i) => i.id === id);
      await deleteInvoice(id);
      if (profile) logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "delete", module: "invoices", entityId: id, entityRef: inv?.invoiceNumber, details: `Invoice ${inv?.invoiceNumber ?? id} deleted`, timestamp: new Date().toISOString() });
      setInvoices((prev) => prev.filter((i) => i.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = filter === "all" ? invoices
    : filter === "draft"            ? invoices.filter((i) => i.approvalStatus === "draft")
    : filter === "pending_approval" ? invoices.filter((i) => i.approvalStatus === "pending_approval")
    : invoices.filter((i) => i.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {([
            { v: "all",             label: "All" },
            { v: "draft",           label: "Draft" },
            { v: "pending_approval",label: "Awaiting Approval" },
            { v: "pending",         label: "Pending" },
            { v: "paid",            label: "Paid" },
            { v: "overdue",         label: "Overdue" },
          ] as { v: FilterValue; label: string }[]).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica transition-colors border",
                filter === v
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {label}
              <span className="ml-1.5 text-[10px] opacity-60">
                {v === "all"             ? invoices.length
                 : v === "draft"         ? invoices.filter((i) => i.approvalStatus === "draft").length
                 : v === "pending_approval" ? invoices.filter((i) => i.approvalStatus === "pending_approval").length
                 : invoices.filter((i) => i.status === (v as Invoice["status"])).length}
              </span>
            </button>
          ))}
        </div>

        {canManage && (
          <Link href="/dashboard/finance/invoices/new" className="btn-primary text-xs px-4 py-2.5">
            <PlusIcon /> New Invoice
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {filter === "all" ? "No invoices yet." : `No ${filter} invoices.`}
            </p>
            {canManage && filter === "all" && (
              <Link
                href="/dashboard/finance/invoices/new"
                className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline"
              >
                Create your first invoice →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Invoice #</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Invoice Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Due Date</th>
                  <th className="px-6 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount</th>
                  <th className="px-6 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Payment</th>
                  <th className="px-6 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Approval</th>
                  <th className="px-6 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/finance/invoices/${inv.id}`}
                        className="font-orbitron text-xs text-accent hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-white font-helvetica">{inv.client.name}</p>
                      <p className="text-xs text-white/30 font-helvetica">{inv.client.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-white/40 font-helvetica">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="px-6 py-4 text-xs text-white/40 font-helvetica">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-helvetica font-semibold text-right">
                      {formatNaira(inv.total)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      {inv.approvalStatus ? (
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", APPROVAL_STATUS_STYLES[inv.approvalStatus as ApprovalStatus])}>
                          {APPROVAL_STATUS_LABELS[inv.approvalStatus as ApprovalStatus]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/20 font-helvetica">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/finance/invoices/${inv.id}`}
                          className="text-xs text-white/40 hover:text-white font-helvetica px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                        >
                          View
                        </Link>
                        {canManage && inv.status !== "paid" && (
                          <button
                            onClick={() => markStatus(inv.id, "paid")}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-helvetica px-2.5 py-1 rounded-lg border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                        {canManage && inv.status === "pending" && (
                          <button
                            onClick={() => markStatus(inv.id, "overdue")}
                            className="text-xs text-red-400 hover:text-red-300 font-helvetica px-2.5 py-1 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-colors"
                          >
                            Overdue
                          </button>
                        )}
                        {canDelete && inv.status !== "paid" && (
                          confirmDeleteId === inv.id ? (
                            <>
                              <button
                                type="button"
                                disabled={deletingId === inv.id}
                                onClick={() => removeInvoice(inv.id)}
                                className="text-xs text-white bg-red-600 hover:bg-red-700 font-helvetica px-2.5 py-1 rounded-lg disabled:opacity-50"
                              >
                                {deletingId === inv.id ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-white/40 hover:text-white font-helvetica px-2"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(inv.id)}
                              className="text-xs text-red-400 hover:text-red-300 font-helvetica px-2.5 py-1 rounded-lg border border-red-500/25 hover:border-red-500/50 transition-colors"
                            >
                              Delete
                            </button>
                          )
                        )}
                      </div>
                    </td>
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

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
