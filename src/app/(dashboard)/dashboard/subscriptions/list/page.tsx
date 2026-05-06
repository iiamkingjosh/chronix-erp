"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSubscriptions, cancelSubscription } from "@/lib/subscriptions-service";
import {
  EXPIRY_BAND_STYLES, EXPIRY_BAND_LABELS,
  SUB_TYPE_LABELS, SUB_PROVIDER_LABELS,
  getExpiryBand, getDaysLeft, formatDaysLeft, formatSubDate,
} from "@/types/subscriptions";
import type { Subscription, ExpiryBand, SubType } from "@/types/subscriptions";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

type BandFilter = "all" | ExpiryBand;

export default function SubscriptionsListPage() {
  const { profile }   = useAuth();
  const [subs, setSubs]     = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [bandFilter, setBandFilter] = useState<BandFilter>("all");

  const canManage = profile ? hasPermission(profile.role, "manage:subscriptions") : false;

  useEffect(() => {
    getSubscriptions().then(setSubs).finally(() => setLoading(false));
  }, []);

  const filtered = subs.filter((s) => {
    if (bandFilter !== "all" && getExpiryBand(s.expiryDate, s.cancelled) !== bandFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.itemName.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q) || s.provider.toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => getDaysLeft(a.expiryDate) - getDaysLeft(b.expiryDate));

  const totalAnnual = subs.filter((s) => !s.cancelled).reduce((sum, s) => sum + s.renewalCost, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, clients, providers…" className="input-field pl-10"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {(["all", "expired", "critical", "warning", "upcoming", "active"] as BandFilter[]).map((b) => (
            <button
              key={b}
              onClick={() => setBandFilter(b)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
                bandFilter === b
                  ? b === "all" ? "bg-white/10 text-white border-white/20" : cn(EXPIRY_BAND_STYLES[b as ExpiryBand])
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {b === "all" ? `All (${subs.length})` : EXPIRY_BAND_LABELS[b as ExpiryBand]}
            </button>
          ))}
        </div>

        {canManage && (
          <Link href="/dashboard/subscriptions/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> Add New
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-white/30 font-helvetica">{sorted.length} item{sorted.length !== 1 ? "s" : ""}</p>
        <p className="text-xs text-white/40 font-helvetica">Total annual renewal: <span className="text-secondary font-semibold">{formatNaira(totalAnnual)}</span></p>
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {sorted.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {subs.length === 0 ? "No subscriptions tracked yet." : "No items match filters."}
            </p>
            {canManage && subs.length === 0 && (
              <Link href="/dashboard/subscriptions/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Add first subscription →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Item</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Type</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Provider</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Expiry</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Days Left</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Renewal Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((sub) => {
                  const band = getExpiryBand(sub.expiryDate, sub.cancelled);
                  const days = getDaysLeft(sub.expiryDate);
                  return (
                    <tr key={sub.id} className={cn(
                      "hover:bg-white/[0.02] transition-colors",
                      band === "expired" && "bg-red-500/[0.03]",
                      band === "critical" && "bg-accent/[0.02]",
                    )}>
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/subscriptions/${sub.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                          {sub.itemName}
                        </Link>
                        <p className="text-[10px] text-accent/60 font-orbitron">{sub.subId}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{sub.clientName || "—"}</td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">
                        {SUB_TYPE_LABELS[sub.type as SubType] ?? sub.type}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica capitalize">
                        {SUB_PROVIDER_LABELS[sub.provider as keyof typeof SUB_PROVIDER_LABELS] ?? sub.provider}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">{formatSubDate(sub.expiryDate)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", EXPIRY_BAND_STYLES[band])}>
                          {formatDaysLeft(days)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", EXPIRY_BAND_STYLES[band])}>
                          {EXPIRY_BAND_LABELS[band]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white font-semibold font-helvetica text-right">
                        {formatNaira(sub.renewalCost)}
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

function SearchIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function PlusIcon()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
