"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getLead, updateLeadStage, addLeadActivity,
  addFollowUp, completeFollowUp, convertToClient,
} from "@/lib/crm-service";
import {
  STAGE_LABELS, STAGE_STYLES, SOURCE_LABELS, SOURCE_STYLES,
  formatCrmDate, formatCrmDateTime, isOverdue, isDueToday,
} from "@/types/crm";
import type { Lead, LeadStage, ActivityEntry, FollowUp } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const STAGES: LeadStage[] = ["lead", "prospect", "client", "retained"];

export default function LeadDetailPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [lead, setLead]           = useState<Lead | null>(null);
  const [loading, setLoading]     = useState(true);
  const [noteText, setNoteText]   = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [fuDate, setFuDate]       = useState("");
  const [fuNotes, setFuNotes]     = useState("");
  const [addingFu, setAddingFu]   = useState(false);
  const [converting, setConverting] = useState(false);
  const [showFuForm, setShowFuForm] = useState(false);

  const canManage = profile ? hasPermission(profile.role, "manage:crm") : false;

  useEffect(() => {
    if (!id) return;
    getLead(id).then(setLead).finally(() => setLoading(false));
  }, [id]);

  async function handleStageChange(stage: LeadStage) {
    if (!lead || !profile) return;
    await updateLeadStage(lead.id, stage, { uid: profile.uid, name: profile.displayName ?? profile.email });
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "crm", entityId: lead.id, entityRef: lead.fullName, details: `Lead ${lead.fullName} moved to stage: ${STAGE_LABELS[stage]}`, timestamp: new Date().toISOString() });
    setLead((prev) => prev ? { ...prev, stage } : prev);
  }

  async function handleAddNote() {
    if (!lead || !profile || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const entry: ActivityEntry = {
        id:         Date.now().toString(),
        type:       "note",
        content:    noteText.trim(),
        authorUid:  profile.uid,
        authorName: profile.displayName ?? profile.email,
        createdAt:  new Date().toISOString(),
      };
      await addLeadActivity(lead.id, entry);
      setLead((prev) => prev ? { ...prev, activity: [...prev.activity, entry] } : prev);
      setNoteText("");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleAddFollowUp() {
    if (!lead || !profile || !fuDate) return;
    setAddingFu(true);
    try {
      const fu: FollowUp = {
        id:            Date.now().toString(),
        date:          fuDate,
        notes:         fuNotes,
        createdBy:     profile.uid,
        createdByName: profile.displayName ?? profile.email,
      };
      await addFollowUp(lead.id, fu, { uid: profile.uid, name: profile.displayName ?? profile.email });
      setLead((prev) =>
        prev ? { ...prev, followUps: [...prev.followUps, fu], nextFollowUpDate: fuDate } : prev
      );
      setFuDate(""); setFuNotes(""); setShowFuForm(false);
    } finally {
      setAddingFu(false);
    }
  }

  async function handleCompleteFollowUp(fuId: string) {
    if (!lead || !profile) return;
    await completeFollowUp(lead.id, fuId, lead.followUps, { uid: profile.uid, name: profile.displayName ?? profile.email });
    const updated = await getLead(lead.id);
    setLead(updated);
  }

  async function handleConvert() {
    if (!lead || !profile) return;
    setConverting(true);
    try {
      const client = await convertToClient(lead, { uid: profile.uid, name: profile.displayName ?? profile.email });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "crm", entityId: lead.id, entityRef: lead.fullName, details: `Lead ${lead.fullName} converted to client (${client.clientId})`, timestamp: new Date().toISOString() });
      router.push(`/dashboard/crm/clients/${client.id}`);
    } catch {
      setConverting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!lead) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Lead not found.</p></div>;
  }

  const sortedActivity = [...(lead.activity ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const pendingFu = lead.followUps.filter((f) => !f.completedAt);

  return (
    <div className="animate-fade-in max-w-6xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back to Leads
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header */}
          <div className="surface-card p-6">
            <div className="flex flex-wrap items-start gap-3 mb-2">
              <span className="font-orbitron text-xs text-accent">{lead.leadId}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STAGE_STYLES[lead.stage])}>
                {STAGE_LABELS[lead.stage]}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", SOURCE_STYLES[lead.source])}>
                {SOURCE_LABELS[lead.source]}
              </span>
            </div>
            <h2 className="font-orbitron text-xl font-bold text-white">{lead.fullName}</h2>
            {lead.company && <p className="text-white/40 text-sm font-helvetica mt-0.5">{lead.company}</p>}
          </div>

          {/* Stage progression */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Stage Progression</h3>
            <div className="flex items-center gap-0">
              {STAGES.map((s, i) => {
                const isActive  = lead.stage === s;
                const isPast    = STAGES.indexOf(lead.stage) > i;
                const isLast    = i === STAGES.length - 1;
                return (
                  <div key={s} className="flex items-center flex-1">
                    <button
                      onClick={() => canManage && handleStageChange(s)}
                      disabled={!canManage}
                      className={cn(
                        "flex-1 py-2 px-2 text-xs font-semibold font-helvetica rounded-lg transition-all text-center",
                        isActive  && cn(STAGE_STYLES[s], "ring-1 ring-current"),
                        isPast    && "bg-white/5 text-white/40 border border-white/10",
                        !isActive && !isPast && "bg-white/[0.02] text-white/20 border border-white/5",
                        canManage && !isActive && "hover:opacity-80 cursor-pointer",
                        !canManage && "cursor-default"
                      )}
                    >
                      {STAGE_LABELS[s]}
                    </button>
                    {!isLast && (
                      <div className={cn("w-4 h-0.5 shrink-0", isPast || isActive ? "bg-white/20" : "bg-white/5")} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity timeline */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Activity</h3>
            {sortedActivity.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No activity yet.</p>
            ) : (
              <div className="space-y-3 mb-5">
                {sortedActivity.map((entry) => (
                  <div key={entry.id} className={cn(
                    "rounded-xl border px-4 py-3",
                    entry.type === "note"        && "border-white/10 bg-white/[0.02]",
                    entry.type === "stage_change"&& "border-secondary/20 bg-secondary/5",
                    entry.type === "follow_up"   && "border-accent/15 bg-accent/5",
                    entry.type === "follow_up_done" && "border-emerald-500/20 bg-emerald-500/5",
                    entry.type === "conversion"  && "border-purple-500/20 bg-purple-500/5",
                    entry.type === "assignment"  && "border-accent/10 bg-accent/[0.03]",
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[10px] font-bold text-white/60 shrink-0">
                        {entry.authorName[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-white/60 font-helvetica">{entry.authorName}</span>
                      <span className="text-[10px] text-white/25 font-helvetica ml-auto">{formatCrmDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white/70 font-helvetica">{entry.content}</p>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="field-label">Add Note</label>
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} placeholder="Add a note or update…" className="input-field resize-none mb-2" />
              <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()} className="btn-primary text-xs px-4 py-2.5">
                {addingNote ? <><Spinner /> Adding…</> : "Add Note"}
              </button>
            </div>
          </div>

          {/* Follow-up log */}
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Follow-ups</h3>
              <button onClick={() => setShowFuForm((v) => !v)} className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors">
                {showFuForm ? "Cancel" : "+ Schedule"}
              </button>
            </div>

            {showFuForm && (
              <div className="mb-5 p-4 bg-white/[0.03] border border-white/10 rounded-xl space-y-3 animate-slide-up">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Date</label>
                    <input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="field-label">Notes</label>
                    <input type="text" value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} placeholder="What to discuss…" className="input-field" />
                  </div>
                </div>
                <button onClick={handleAddFollowUp} disabled={addingFu || !fuDate} className="btn-primary text-xs px-4 py-2.5">
                  {addingFu ? <><Spinner /> Saving…</> : "Schedule Follow-up"}
                </button>
              </div>
            )}

            {pendingFu.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No pending follow-ups.</p>
            ) : (
              <div className="space-y-2">
                {pendingFu.sort((a, b) => a.date.localeCompare(b.date)).map((fu) => (
                  <div key={fu.id} className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border",
                    isOverdue(fu.date)  && "border-red-500/30 bg-red-500/5",
                    isDueToday(fu.date) && "border-amber-500/30 bg-amber-500/5",
                    !isOverdue(fu.date) && !isDueToday(fu.date) && "border-white/10 bg-white/[0.02]"
                  )}>
                    <div className="flex-1">
                      <p className={cn("text-sm font-semibold font-helvetica",
                        isOverdue(fu.date)  && "text-red-400",
                        isDueToday(fu.date) && "text-amber-400",
                        !isOverdue(fu.date) && !isDueToday(fu.date) && "text-white"
                      )}>
                        {formatCrmDate(fu.date)}
                        {isOverdue(fu.date)  && " — Overdue"}
                        {isDueToday(fu.date) && " — Today"}
                      </p>
                      {fu.notes && <p className="text-xs text-white/40 font-helvetica mt-0.5">{fu.notes}</p>}
                    </div>
                    <button onClick={() => handleCompleteFollowUp(fu.id)} className="text-xs text-emerald-400 hover:text-emerald-300 font-helvetica border border-emerald-500/20 hover:border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors">
                      Done
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right ── */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Contact Info</p>
            <div className="space-y-2 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Email: </span>{lead.email}</p>
              <p className="text-white/60"><span className="text-white/30">Phone: </span>{lead.phone}</p>
              {lead.company && <p className="text-white/60"><span className="text-white/30">Company: </span>{lead.company}</p>}
            </div>
          </div>

          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Assigned To</p>
            <p className="text-white text-sm font-helvetica font-semibold">{lead.assignedName}</p>
          </div>

          <div className="surface-card p-5 space-y-2">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Timeline</p>
            <InfoRow label="Created"  value={formatCrmDateTime(lead.createdAt)} />
            <InfoRow label="Updated"  value={formatCrmDateTime(lead.updatedAt)} />
            {lead.convertedAt && <InfoRow label="Converted" value={formatCrmDateTime(lead.convertedAt)} />}
          </div>

          {lead.notes && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-white/50 font-helvetica leading-relaxed">{lead.notes}</p>
            </div>
          )}

          {/* Convert to client button */}
          {canManage && lead.stage !== "client" && lead.stage !== "retained" && !lead.convertedAt && (
            <button
              onClick={handleConvert}
              disabled={converting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-helvetica transition-colors"
            >
              {converting ? <><Spinner /> Converting…</> : <><ConvertIcon /> Convert to Client</>}
            </button>
          )}

          {lead.clientId && (
            <Link href={`/dashboard/crm/clients/${lead.clientId}`} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-sm font-helvetica transition-colors">
              View Client Profile →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs font-helvetica">
      <span className="text-white/30">{label}</span>
      <span className="text-white/60 text-right">{value}</span>
    </div>
  );
}
function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function ConvertIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>; }
function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
