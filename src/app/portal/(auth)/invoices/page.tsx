"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { getPortalInvoices } from "@/lib/client-portal-service";
import type { Invoice } from "@/types/finance";
import { formatNaira, formatDate } from "@/types/finance";
import { cn } from "@/lib/utils";

export default function PortalInvoicesPage() {
  const { clientRecord, profile } = useClientAuth();
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [loading, setLoading]     = useState(true);

  const clientName = clientRecord?.company || clientRecord?.fullName || profile?.email || "";

  useEffect(() => {
    if (!clientName) return;
    getPortalInvoices(clientName, clientRecord?.id).then(setInvoices).finally(() => setLoading(false));
  }, [clientName, clientRecord?.id]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const totalOwed = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.total, 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-white">Invoices</h1>
        <p className="text-white/40 text-sm font-helvetica mt-1">Your billing history with Chronix Technology</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
          <p className="font-orbitron text-xl font-bold text-white">{invoices.length}</p>
          <p className="text-white/40 text-xs font-helvetica mt-1">Total Invoices</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
          <p className="font-orbitron text-xl font-bold text-emerald-400">{formatNaira(totalPaid)}</p>
          <p className="text-white/40 text-xs font-helvetica mt-1">Total Paid</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
          <p className={cn("font-orbitron text-xl font-bold", totalOwed > 0 ? "text-amber-400" : "text-white/40")}>
            {formatNaira(totalOwed)}
          </p>
          <p className="text-white/40 text-xs font-helvetica mt-1">Outstanding</p>
        </div>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
        {invoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No invoices found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["Invoice #", "Date", "Due Date", "Amount", "Status", ""].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold text-white font-helvetica">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{formatDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-white font-helvetica">{formatNaira(inv.total)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                        inv.status === "paid"    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                        inv.status === "overdue" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                        "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      )}>
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/portal/invoices/${inv.id}`} className="text-xs text-accent hover:underline font-helvetica">
                        View
                      </Link>
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
