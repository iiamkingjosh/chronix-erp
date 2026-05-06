"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeads, completeFollowUp } from "@/lib/crm-service";
import {
  STAGE_STYLES, STAGE_LABELS,
  formatCrmDate, formatCrmDateTime, isOverdue, isDueToday,
} from "@/types/crm";
import type { Lead, FollowUp } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

interface FuItem {
  lead: Lead;
  followUp: FollowUp;
}

function getDueInDays(dateStr: string): number {
  const now      = new Date();
  now.setHours(0, 0, 0, 0);
  const due      = new Date(dateStr + "T00:00:00");
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

export default function FollowUpsPage() {
  const { profile } = useAuth();
  const [items, setItems]     = useState<FuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canSeeAll = profile
    ? hasPermission(profile.role, "view:all") || hasPermission(profile.role, "manage:crm")
    : false;

  useEffect(() => {
    getLeads().then((leads) => {
      const filtered = canSeeAll
        ? leads
        : leads.filter((l) => l.assignedTo === profile?.uid);

      const upcoming: FuItem[] = [];
      for (const lead of filtered) {
        for (const fu of lead.followUps ?? []) {
          if (!fu.completedAt && getDueInDays(fu.date) <= 30) {
            upcoming.push({ lead, followUp: fu });
          }
        }
      }
      // Sort by date ascending
      upcoming.sort((a, b) => a.followUp.date.localeCompare(b.followUp.date));
      setItems(upcoming);
    }).finally(() => setLoading(false));
  }, [profile?.uid, canSeeAll]);

  async function handleComplete(lead: Lead, fuId: string) {
    if (!profile) return;
    await completeFollowUp(lead.id, fuId, lead.followUps, {
      uid:  profile.uid,
      name: profile.displayName ?? profile.email,
    });
    setItems((prev) => prev.filter((i) => !(i.lead.id === lead.id && i.followUp.id === fuId)));
  }

  const overdue   = items.filter((i) => isOverdue(i.followUp.date));
  const dueToday  = items.filter((i) => isDueToday(i.followUp.date));
  const upcoming  = items.filter((i) => !isOverdue(i.followUp.date) && !isDueToday(i.followUp.date));

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="surface-card p-5 border border-red-500/20">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Overdue</p>
          <p className="font-orbitron text-3xl font-bold text-red-400">{overdue.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">need immediate action</p>
        </div>
        <div className="surface-card p-5 border border-amber-500/20">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Due Today</p>
          <p className="font-orbitron text-3xl font-bold text-amber-400">{dueToday.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">follow up today</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Upcoming (30d)</p>
          <p className="font-orbitron text-3xl font-bold text-white">{upcoming.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">scheduled follow-ups</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="surface-card px-6 py-16 text-center">
          <p className="text-emerald-400 font-orbitron text-sm font-semibold mb-2">All Clear!</p>
          <p className="text-white/20 text-sm font-helvetica">No pending follow-ups in the next 30 days.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <Section title="Overdue" titleClass="text-red-400" items={overdue} onComplete={handleComplete} />
          )}
          {dueToday.length > 0 && (
            <Section title="Due Today" titleClass="text-amber-400" items={dueToday} onComplete={handleComplete} />
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming" titleClass="text-white/60" items={upcoming} onComplete={handleComplete} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title, titleClass, items, onComplete,
}: {
  title: string;
  titleClass: string;
  items: FuItem[];
  onComplete: (lead: Lead, fuId: string) => void;
}) {
  return (
    <div>
      <h3 className={cn("font-orbitron text-xs font-semibold uppercase tracking-widest mb-3", titleClass)}>
        {title} ({items.length})
      </h3>
      <div className="surface-card overflow-hidden">
        <div className="divide-y divide-white/5">
          {items.map(({ lead, followUp }) => {
            const daysLeft = getDueInDays(followUp.date);
            return (
              <div key={`${lead.id}-${followUp.id}`} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                {/* Date */}
                <div className={cn(
                  "shrink-0 w-14 text-center py-1.5 rounded-lg border",
                  isOverdue(followUp.date)  && "border-red-500/30 bg-red-500/10",
                  isDueToday(followUp.date) && "border-amber-500/30 bg-amber-500/10",
                  !isOverdue(followUp.date) && !isDueToday(followUp.date) && "border-white/10 bg-white/[0.03]"
                )}>
                  <p className={cn("font-orbitron text-xs font-bold",
                    isOverdue(followUp.date)  && "text-red-400",
                    isDueToday(followUp.date) && "text-amber-400",
                    !isOverdue(followUp.date) && !isDueToday(followUp.date) && "text-white/60"
                  )}>
                    {new Date(followUp.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </p>
                  <p className={cn("text-[9px] font-helvetica mt-0.5",
                    isOverdue(followUp.date) ? "text-red-400" : isDueToday(followUp.date) ? "text-amber-400" : "text-white/25"
                  )}>
                    {isOverdue(followUp.date) ? `${Math.abs(daysLeft)}d late` : isDueToday(followUp.date) ? "Today" : `in ${daysLeft}d`}
                  </p>
                </div>

                {/* Lead info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Link href={`/dashboard/crm/leads/${lead.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                      {lead.fullName}
                    </Link>
                    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border font-helvetica", STAGE_STYLES[lead.stage])}>
                      {STAGE_LABELS[lead.stage]}
                    </span>
                  </div>
                  {lead.company && <p className="text-xs text-white/30 font-helvetica">{lead.company}</p>}
                  {followUp.notes && <p className="text-xs text-white/40 font-helvetica mt-0.5 truncate">{followUp.notes}</p>}
                </div>

                {/* Assigned */}
                <p className="text-xs text-white/30 font-helvetica shrink-0 hidden sm:block">{lead.assignedName.split(" ")[0]}</p>

                {/* Complete button */}
                <button
                  onClick={() => onComplete(lead, followUp.id)}
                  className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300 font-helvetica border border-emerald-500/20 hover:border-emerald-500/40 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
