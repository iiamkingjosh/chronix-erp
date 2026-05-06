"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSubscriptions } from "@/lib/subscriptions-service";
import { checkSubscriptionReminders } from "@/lib/notifications-service";
import {
  EXPIRY_BAND_LABELS, EXPIRY_BAND_STYLES, EXPIRY_BAND_CARD_STYLES,
  SUB_TYPE_LABELS, getExpiryBand, getDaysLeft, formatDaysLeft,
  formatSubDate,
} from "@/types/subscriptions";
import type { Subscription, ExpiryBand } from "@/types/subscriptions";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

const BANDS: ExpiryBand[] = ["expired", "critical", "warning", "upcoming", "active"];

export default function ExpiryDashboard() {
  const [subs, setSubs]     = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscriptions().then((data) => {
      setSubs(data);
      checkSubscriptionReminders(data).catch(() => {});
    }).finally(() => setLoading(false));
  }, []);

  const active = subs.filter((s) => !s.cancelled);
  const byBand = (band: ExpiryBand) => active.filter((s) => getExpiryBand(s.expiryDate, s.cancelled) === band);

  const expiredSubs  = byBand("expired");
  const criticalSubs = byBand("critical");
  const warningSubs  = byBand("warning");
  const upcomingSubs = byBand("upcoming");

  const urgentSubs = [...expiredSubs, ...criticalSubs, ...warningSubs, ...upcomingSubs]
    .sort((a, b) => getDaysLeft(a.expiryDate) - getDaysLeft(b.expiryDate));

  const totalMonthlyRenewal = active.reduce((s, sub) => s + sub.renewalCost, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Alert banner */}
      {(expiredSubs.length > 0 || criticalSubs.length > 0) && (
        <div className={cn(
          "flex items-start gap-3 px-5 py-4 rounded-xl border mb-6",
          expiredSubs.length > 0 ? "bg-red-500/10 border-red-500/30" : "bg-accent/10 border-accent/30"
        )}>
          <span className={cn("text-xl shrink-0", expiredSubs.length > 0 ? "text-red-400" : "text-accent")}>⚠</span>
          <div>
            {expiredSubs.length > 0 && (
              <p className="text-red-400 text-sm font-semibold font-helvetica">
                {expiredSubs.length} item{expiredSubs.length !== 1 ? "s" : ""} have expired and need immediate renewal.
              </p>
            )}
            {criticalSubs.length > 0 && (
              <p className="text-accent text-sm font-helvetica mt-0.5">
                {criticalSubs.length} item{criticalSubs.length !== 1 ? "s" : ""} expire within 7 days.
              </p>
            )}
          </div>
          <Link href="/dashboard/subscriptions/list" className="ml-auto text-xs text-white/50 hover:text-white font-helvetica transition-colors whitespace-nowrap">
            View all →
          </Link>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-8">
        {BANDS.map((band) => {
          const count = byBand(band).length;
          return (
            <div key={band} className={cn("surface-card p-4 text-center border", EXPIRY_BAND_CARD_STYLES[band])}>
              <p className={cn("font-orbitron text-2xl font-bold", EXPIRY_BAND_STYLES[band].split(" ")[1])}>{count}</p>
              <p className="text-white/30 text-[10px] font-helvetica mt-1">{EXPIRY_BAND_LABELS[band]}</p>
            </div>
          );
        })}
      </div>

      {/* Renewal cost summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-white">{active.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Active Subscriptions</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(totalMonthlyRenewal)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Annual Renewal Cost</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-xl font-bold text-amber-400">{urgentSubs.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Needs Attention</p>
        </div>
      </div>

      {/* Urgent items */}
      {urgentSubs.length > 0 && (
        <div className="surface-card mb-6">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
              Action Required
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {urgentSubs.slice(0, 10).map((sub) => {
              const band = getExpiryBand(sub.expiryDate, sub.cancelled);
              const days = getDaysLeft(sub.expiryDate);
              return (
                <div key={sub.id} className={cn("px-6 py-4 flex items-center gap-4", band === "expired" && "bg-red-500/[0.03]", band === "critical" && "bg-accent/[0.02]")}>
                  {/* Days indicator */}
                  <div className={cn("shrink-0 w-16 text-center py-1.5 rounded-lg border", EXPIRY_BAND_CARD_STYLES[band])}>
                    <p className={cn("font-orbitron text-xs font-bold", EXPIRY_BAND_STYLES[band].split(" ")[1])}>
                      {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
                    </p>
                    <p className={cn("text-[9px] font-helvetica", EXPIRY_BAND_STYLES[band].split(" ")[1])}>
                      {days < 0 ? "overdue" : "left"}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/dashboard/subscriptions/${sub.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                      {sub.itemName}
                    </Link>
                    <p className="text-xs text-white/30 font-helvetica mt-0.5">
                      {sub.clientName} · {sub.provider} · {SUB_TYPE_LABELS[sub.type as keyof typeof SUB_TYPE_LABELS] ?? sub.type}
                    </p>
                  </div>
                  <p className="text-xs text-white/40 font-helvetica shrink-0">{formatSubDate(sub.expiryDate)}</p>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica shrink-0", EXPIRY_BAND_STYLES[band])}>
                    {formatDaysLeft(days)}
                  </span>
                  <Link href={`/dashboard/subscriptions/${sub.id}`} className="shrink-0 text-xs text-accent hover:text-accent/80 font-helvetica border border-accent/20 hover:border-accent/40 px-2.5 py-1 rounded-lg transition-colors">
                    Renew
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline by band */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BANDS.filter((b) => b !== "active" && b !== "cancelled").map((band) => {
          const items = byBand(band);
          if (items.length === 0) return null;
          return (
            <div key={band} className={cn("surface-card border overflow-hidden", EXPIRY_BAND_CARD_STYLES[band])}>
              <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
                <span className={cn("font-orbitron text-xs font-semibold uppercase tracking-widest", EXPIRY_BAND_STYLES[band].split(" ")[1])}>
                  {EXPIRY_BAND_LABELS[band]} ({items.length})
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {items.slice(0, 5).map((sub) => (
                  <div key={sub.id} className="px-5 py-3 flex items-center gap-3">
                    <Link href={`/dashboard/subscriptions/${sub.id}`} className="flex-1 text-sm text-white hover:text-accent font-helvetica transition-colors line-clamp-1">
                      {sub.itemName}
                    </Link>
                    <p className="text-xs text-white/40 font-helvetica shrink-0">{formatSubDate(sub.expiryDate)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
