"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPOs, updatePOStatus } from "@/lib/procurement-service";
import {
  PO_STATUS_LABELS, PO_STATUS_STYLES,
  formatProcDate, formatProcDateTime,
} from "@/types/procurement";
import type { PurchaseOrder, POStatus } from "@/types/procurement";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const PO_FLOW: POStatus[] = ["pending", "approved", "delivered", "paid"];

export default function POListPage() {
  const { profile } = useAuth();
  const [orders, setOrders]   = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | POStatus>("all");

  const canManage = profile ? hasPermission(profile.role, "manage:procurement") : false;

  useEffect(() => {
    getPOs().then(setOrders).finally(() => setLoading(false));
  }, []);

  async function handleAdvanceStatus(po: PurchaseOrder) {
    const idx = PO_FLOW.indexOf(po.status);
    if (idx === -1 || idx >= PO_FLOW.length - 1) return;
    const next = PO_FLOW[idx + 1];
    await updatePOStatus(po.id, next, profile ? { uid: profile.uid, name: profile.displayName ?? profile.email } : undefined);
    setOrders((prev) => prev.map((o) => (o.id === po.id ? { ...o, status: next } : o)));
  }

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const totalValue = orders.reduce((s, o) => s + o.total, 0);
  const pendingVal = orders.filter((o) => o.status === "pending" || o.status === "approved").reduce((s, o) => s + o.total, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-white">{orders.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total POs</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(totalValue)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total Value</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-amber-400">{formatNaira(pendingVal)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Outstanding</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-emerald-400">
            {orders.filter((o) => o.status === "paid").length}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Paid</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 justify-between mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {(["all","pending","approved","delivered","paid","cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
                filter === s
                  ? s === "all" ? "bg-white/10 text-white border-white/20" : cn(PO_STATUS_STYLES[s as POStatus])
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {s === "all" ? `All (${orders.length})` : PO_STATUS_LABELS[s as POStatus]}
            </button>
          ))}
        </div>
        {canManage && (
          <Link href="/dashboard/procurement/orders/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> New PO
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {orders.length === 0 ? "No purchase orders yet." : "No POs match filter."}
            </p>
            {canManage && orders.length === 0 && (
              <Link href="/dashboard/procurement/orders/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Create first PO →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">PO #</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Vendor</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Created</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Delivery</th>
                  <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Total</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  {canManage && <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((po) => {
                  const nextIdx = PO_FLOW.indexOf(po.status);
                  const nextStatus = nextIdx >= 0 && nextIdx < PO_FLOW.length - 1 ? PO_FLOW[nextIdx + 1] : null;
                  return (
                    <tr key={po.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-orbitron text-xs text-accent">{po.poNumber}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/procurement/vendors/${po.vendorId}`} className="text-sm text-white hover:text-accent font-helvetica transition-colors">
                          {po.vendorName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatProcDateTime(po.createdAt)}</td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatProcDate(po.deliveryDate)}</td>
                      <td className="px-5 py-3.5 text-sm text-white font-semibold font-helvetica text-right">{formatNaira(po.total)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PO_STATUS_STYLES[po.status])}>
                          {PO_STATUS_LABELS[po.status]}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          {nextStatus && po.status !== "cancelled" && (
                            <button
                              onClick={() => handleAdvanceStatus(po)}
                              className="text-xs text-secondary hover:text-secondary/80 font-helvetica border border-secondary/20 hover:border-secondary/40 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                            >
                              → {PO_STATUS_LABELS[nextStatus]}
                            </button>
                          )}
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

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
