"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getLeads, updateLeadStage } from "@/lib/crm-service";
import {
  STAGE_LABELS, STAGE_STYLES, STAGE_COLUMN_STYLES,
  SOURCE_LABELS, SOURCE_STYLES,
  formatCrmDate, formatCrmDateTime,
} from "@/types/crm";
import type { Lead, LeadStage } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const STAGES: LeadStage[] = ["lead", "prospect", "client", "retained"];

export default function PipelinePage() {
  const { profile } = useAuth();
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:crm") : false;
  const canSeeAll = profile ? hasPermission(profile.role, "view:all") || canManage : false;

  useEffect(() => {
    getLeads().then((all) => {
      setLeads(canSeeAll ? all : all.filter((l) => l.assignedTo === profile?.uid));
    }).finally(() => setLoading(false));
  }, [profile?.uid, canSeeAll]);

  function handleDragStart(e: React.DragEvent, leadId: string) {
    setDragging(leadId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, stage: LeadStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(stage);
  }

  async function handleDrop(e: React.DragEvent, targetStage: LeadStage) {
    e.preventDefault();
    setDragOver(null);
    if (!dragging || !profile) return;
    const lead = leads.find((l) => l.id === dragging);
    if (!lead || lead.stage === targetStage) { setDragging(null); return; }

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === dragging ? { ...l, stage: targetStage } : l))
    );
    try {
      await updateLeadStage(dragging, targetStage, {
        uid:  profile.uid,
        name: profile.displayName ?? profile.email,
      });
    } catch {
      // Revert on failure
      setLeads((prev) => prev.map((l) => (l.id === dragging ? { ...l, stage: lead.stage } : l)));
    }
    setDragging(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  const byStage = (stage: LeadStage) => leads.filter((l) => l.stage === stage);
  const totalValue = leads.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Summary */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/40 text-sm font-helvetica">
          {totalValue} total lead{totalValue !== 1 ? "s" : ""} in pipeline
          {!canSeeAll && " (assigned to you)"}
        </p>
        {canManage && (
          <Link href="/dashboard/crm/leads/new" className="btn-primary text-xs px-4 py-2.5">
            <PlusIcon /> Add Lead
          </Link>
        )}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {STAGES.map((stage) => {
          const stageLeads = byStage(stage);
          const styles     = STAGE_COLUMN_STYLES[stage];
          const isOver     = dragOver === stage;

          return (
            <div
              key={stage}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDrop={(e) => handleDrop(e, stage)}
              onDragLeave={() => setDragOver(null)}
              className={cn(
                "rounded-2xl border bg-white/[0.02] min-h-[200px] transition-all",
                isOver ? `ring-2 ${styles.drop} border-transparent` : "border-white/10"
              )}
            >
              {/* Column header */}
              <div className={cn("px-4 py-3 border-b border-white/10 flex items-center gap-2")}>
                <span className={cn("font-orbitron text-xs font-bold uppercase tracking-widest", styles.header)}>
                  {STAGE_LABELS[stage]}
                </span>
                <span className={cn(
                  "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border font-helvetica",
                  stageLeads.length > 0 ? STAGE_STYLES[stage] : "bg-white/5 text-white/20 border-white/10"
                )}>
                  {stageLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="p-3 space-y-2.5">
                {stageLeads.length === 0 && (
                  <p className="text-white/15 text-xs font-helvetica text-center py-6">
                    {isOver ? "Drop here" : "No leads"}
                  </p>
                )}
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={canManage}
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "bg-primary-mid border rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all",
                      styles.card,
                      dragging === lead.id && "opacity-40 scale-95",
                      !canManage && "cursor-default"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link
                        href={`/dashboard/crm/leads/${lead.id}`}
                        className="font-helvetica text-sm font-semibold text-white hover:text-accent transition-colors line-clamp-1"
                      >
                        {lead.fullName}
                      </Link>
                      <span className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 font-helvetica",
                        SOURCE_STYLES[lead.source]
                      )}>
                        {SOURCE_LABELS[lead.source]}
                      </span>
                    </div>

                    {lead.company && (
                      <p className="text-xs text-white/40 font-helvetica mb-2 line-clamp-1">
                        {lead.company}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-white/25 font-helvetica">
                        {lead.assignedName.split(" ")[0]}
                      </p>
                      {lead.nextFollowUpDate && (
                        <p className={cn(
                          "text-[10px] font-helvetica",
                          new Date(lead.nextFollowUpDate) < new Date()
                            ? "text-red-400"
                            : "text-white/30"
                        )}>
                          Follow-up {formatCrmDate(lead.nextFollowUpDate)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {canManage && stageLeads.length > 0 && isOver && (
                  <div className="border-2 border-dashed border-white/20 rounded-xl h-12 flex items-center justify-center">
                    <p className="text-white/30 text-xs font-helvetica">Drop here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
