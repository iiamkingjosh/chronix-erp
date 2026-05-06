"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeads } from "@/lib/crm-service";
import {
  STAGE_LABELS, STAGE_STYLES,
  SOURCE_LABELS, SOURCE_STYLES,
  formatCrmDate, formatCrmDateTime,
} from "@/types/crm";
import type { Lead, LeadStage, LeadSource } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function LeadsPage() {
  const { profile } = useAuth();
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [stage, setStage]     = useState<"all" | LeadStage>("all");

  const canManage = profile ? hasPermission(profile.role, "manage:crm") : false;
  const canSeeAll = profile ? hasPermission(profile.role, "view:all") || canManage : false;

  useEffect(() => {
    getLeads().then((all) => {
      setLeads(canSeeAll ? all : all.filter((l) => l.assignedTo === profile?.uid));
    }).finally(() => setLoading(false));
  }, [profile?.uid, canSeeAll]);

  const filtered = leads.filter((l) => {
    if (stage !== "all" && l.stage !== stage) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.fullName.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email…"
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "lead", "prospect", "client", "retained"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica transition-colors border capitalize",
                stage === s
                  ? s === "all"
                    ? "bg-white/10 text-white border-white/20"
                    : cn(STAGE_STYLES[s as LeadStage])
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {s === "all" ? `All (${leads.length})` : STAGE_LABELS[s as LeadStage]}
            </button>
          ))}
        </div>
        {canManage && (
          <Link href="/dashboard/crm/leads/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> Add Lead
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {leads.length === 0 ? "No leads yet." : "No leads match your filters."}
            </p>
            {canManage && leads.length === 0 && (
              <Link href="/dashboard/crm/leads/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Add your first lead →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Name</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Company</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Contact</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Source</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Stage</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Added</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Next Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/crm/leads/${lead.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                        {lead.fullName}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica">{lead.company || "—"}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs text-white/60 font-helvetica">{lead.email}</p>
                      <p className="text-xs text-white/30 font-helvetica">{lead.phone}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", SOURCE_STYLES[lead.source])}>
                        {SOURCE_LABELS[lead.source]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STAGE_STYLES[lead.stage])}>
                        {STAGE_LABELS[lead.stage]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{lead.assignedName}</td>
                    <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica whitespace-nowrap">{formatCrmDateTime(lead.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      {lead.nextFollowUpDate ? (
                        <span className={cn(
                          "text-xs font-helvetica",
                          new Date(lead.nextFollowUpDate) < new Date() ? "text-red-400" : "text-white/50"
                        )}>
                          {formatCrmDate(lead.nextFollowUpDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-white/20 font-helvetica">—</span>
                      )}
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

function SearchIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
}
function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
