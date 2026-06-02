"use client";

import { useEffect, useState } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { getPortalSubscriptions } from "@/lib/client-portal-service";
import type { Subscription } from "@/types/subscriptions";
import {
  SUB_TYPE_LABELS, SUB_PROVIDER_LABELS,
  EXPIRY_BAND_STYLES, EXPIRY_BAND_LABELS,
  getExpiryBand, getDaysLeft, formatDaysLeft, formatSubDate,
} from "@/types/subscriptions";
import type { SubType, SubProvider } from "@/types/subscriptions";
import { cn } from "@/lib/utils";

export default function PortalSubscriptionsPage() {
  const { clientRecord, profile } = useClientAuth();
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [loading, setLoading]     = useState(true);

  const clientName = clientRecord?.company || clientRecord?.fullName || profile?.email || "";

  useEffect(() => {
    if (!clientName) return;
    getPortalSubscriptions(clientName, clientRecord?.id).then(setSubs).finally(() => setLoading(false));
  }, [clientName, clientRecord?.id]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const expiringSoon = subs.filter((s) => { const d = getDaysLeft(s.expiryDate); return d >= 0 && d <= 60; }).length;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold text-white">Services & Subscriptions</h1>
        <p className="text-white/40 text-sm font-helvetica mt-1">Your active domains, licenses and contracts</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Active Services",  value: subs.length,       color: "text-white" },
          { label: "Expiring ≤ 60d",   value: expiringSoon,      color: expiringSoon > 0 ? "text-amber-400" : "text-white/40" },
          { label: "Annual Cost",      value: `₦${subs.reduce((s, x) => s + x.renewalCost, 0).toLocaleString()}`, color: "text-secondary" },
        ].map((item) => (
          <div key={item.label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
            <p className={cn("font-orbitron text-xl font-bold", item.color)}>{item.value}</p>
            <p className="text-white/40 text-xs font-helvetica mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
        {subs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No active services found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["Service", "Type", "Provider", "Expires", "Status"].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subs.map((sub) => {
                  const band = getExpiryBand(sub.expiryDate, sub.cancelled);
                  const days = getDaysLeft(sub.expiryDate);
                  return (
                    <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-white font-helvetica">{sub.itemName}</p>
                        <p className="text-[10px] text-white/30 font-helvetica">{sub.subId}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">
                        {SUB_TYPE_LABELS[sub.type as SubType] ?? sub.type}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica capitalize">
                        {SUB_PROVIDER_LABELS[sub.provider as SubProvider] ?? sub.provider}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">
                        {formatSubDate(sub.expiryDate)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica w-fit", EXPIRY_BAND_STYLES[band])}>
                            {EXPIRY_BAND_LABELS[band]}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica w-fit", EXPIRY_BAND_STYLES[band])}>
                            {formatDaysLeft(days)}
                          </span>
                        </div>
                      </td>
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
