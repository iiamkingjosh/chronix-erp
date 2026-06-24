"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getTicket,
  updateTicketStatus,
  addTicketNote,
  updateClientFeedback,
  reassignTicket,
  overrideSlaDeadline,
  getStaffList,
  type StaffMember,
} from "@/lib/tickets-service";
import {
  PRIORITY_LABELS, PRIORITY_STYLES,
  STATUS_LABELS,   STATUS_STYLES,
  getSlaStatus, SLA_STATUS_STYLES, formatTimeLeft, formatDateTime,
} from "@/types/tickets";
import type { Ticket, TicketNote, TicketStatus } from "@/types/tickets";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const NOTE_TYPE_STYLES: Record<TicketNote["type"], string> = {
  note:          "border-white/10 bg-white/[0.02]",
  status_change: "border-secondary/20 bg-secondary/5",
  assignment:    "border-accent/15 bg-accent/5",
  resolution:    "border-emerald-500/20 bg-emerald-500/5",
};

function toDatetimeLocalValue(iso: string): string {
  return iso.slice(0, 16);
}

export default function TicketDetailPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [ticket, setTicket]         = useState<Ticket | null>(null);
  const [loading, setLoading]       = useState(true);
  const [noteText, setNoteText]     = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [feedback, setFeedback]     = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [staff, setStaff]           = useState<StaffMember[]>([]);
  const [newAssignee, setNewAssignee] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideDeadline, setOverrideDeadline] = useState("");
  const [overrideReason, setOverrideReason]     = useState("");
  const [overrideError, setOverrideError]       = useState<string | null>(null);
  const [savingOverride, setSavingOverride]     = useState(false);

  const canManage = profile ? hasPermission(profile.role, "manage:tickets") : false;

  useEffect(() => {
    if (!id) return;
    getTicket(id).then((t) => {
      setTicket(t);
      if (t?.clientFeedback) setFeedback(t.clientFeedback);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (canManage) getStaffList().then(setStaff).catch((e) => console.error("Failed to load staff:", e));
  }, [canManage]);

  async function handleStatusChange(status: TicketStatus) {
    if (!ticket || !profile) return;
    await updateTicketStatus(ticket.id, status, {
      uid:  profile.uid,
      name: profile.displayName ?? profile.email,
    });
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: status === "resolved" ? "resolve" : "update", module: "tickets", entityId: ticket.id, entityRef: ticket.ticketId, details: `Ticket ${ticket.ticketId} status changed to ${STATUS_LABELS[status]}`, timestamp: new Date().toISOString() });
    const updated = await getTicket(ticket.id);
    setTicket(updated);
  }

  async function handleOverrideDeadline() {
    if (!ticket || !profile || !overrideDeadline) return;
    setOverrideError(null);
    setSavingOverride(true);
    try {
      await overrideSlaDeadline(ticket.id, new Date(overrideDeadline).toISOString(), overrideReason, profile.uid);
      const updated = await getTicket(ticket.id);
      setTicket(updated);
      setShowOverrideForm(false);
      setOverrideReason("");
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "Could not override deadline.");
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleAddNote() {
    if (!ticket || !profile || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const note: TicketNote = {
        id:         Date.now().toString(),
        authorUid:  profile.uid,
        authorName: profile.displayName ?? profile.email,
        content:    noteText.trim(),
        type:       "note",
        createdAt:  new Date().toISOString(),
      };
      await addTicketNote(ticket.id, note);
      setTicket((prev) => prev ? { ...prev, notes: [...prev.notes, note], updatedAt: new Date().toISOString() } : prev);
      setNoteText("");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleSaveFeedback() {
    if (!ticket) return;
    setSavingFeedback(true);
    try {
      await updateClientFeedback(ticket.id, feedback);
      setTicket((prev) => prev ? { ...prev, clientFeedback: feedback } : prev);
    } finally {
      setSavingFeedback(false);
    }
  }

  async function handleReassign() {
    if (!ticket || !profile || !newAssignee) return;
    const member = staff.find((s) => s.uid === newAssignee);
    if (!member) return;
    await reassignTicket(ticket.id, member.uid, member.displayName, {
      uid:  profile.uid,
      name: profile.displayName ?? profile.email,
    });
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "assign", module: "tickets", entityId: ticket.id, entityRef: ticket.ticketId, details: `Ticket ${ticket.ticketId} reassigned to ${member.displayName}`, timestamp: new Date().toISOString() });
    const updated = await getTicket(ticket.id);
    setTicket(updated);
    setNewAssignee("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">Ticket not found.</p>
        <button onClick={() => router.back()} className="mt-4 text-accent text-sm hover:underline font-helvetica">← Go back</button>
      </div>
    );
  }

  const sla     = getSlaStatus(ticket.slaDeadline, ticket.status);
  const sortedNotes = [...(ticket.notes ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="animate-fade-in max-w-6xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors"
      >
        <BackIcon /> Back to Tickets
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Main content ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Header */}
          <div className="surface-card p-6">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <span className="font-orbitron text-xs text-accent">{ticket.ticketId}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PRIORITY_STYLES[ticket.priority])}>
                {PRIORITY_LABELS[ticket.priority]}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STATUS_STYLES[ticket.status])}>
                {STATUS_LABELS[ticket.status]}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", SLA_STATUS_STYLES[sla])}>
                {formatTimeLeft(ticket.slaDeadline)}
              </span>
            </div>
            <h2 className="font-orbitron text-lg font-bold text-white mb-1">{ticket.title}</h2>
            <p className="text-white/40 text-xs font-helvetica">
              Opened {formatDateTime(ticket.createdAt)} &nbsp;·&nbsp; Last updated {formatDateTime(ticket.updatedAt)}
            </p>
          </div>

          {/* Description */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Description</h3>
            <p className="text-white/70 text-sm font-helvetica leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Activity timeline */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Activity</h3>
            {sortedNotes.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedNotes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      "rounded-xl border px-4 py-3",
                      NOTE_TYPE_STYLES[note.type] ?? NOTE_TYPE_STYLES.note
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[10px] font-bold text-white/60 shrink-0">
                        {note.authorName[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-white/60 font-helvetica">{note.authorName}</span>
                      <span className="text-[10px] text-white/25 font-helvetica ml-auto">{formatDateTime(note.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white/70 font-helvetica leading-relaxed">{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add note */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <label className="field-label">Add Internal Note</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Add a note, update, or resolution details…"
                className="input-field resize-none mb-3"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !noteText.trim()}
                className="btn-primary text-xs px-4 py-2.5"
              >
                {addingNote ? <><Spinner /> Adding…</> : "Add Note"}
              </button>
            </div>
          </div>

          {/* Client feedback */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Client Feedback</h3>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Client satisfaction notes, rating, comments…"
              className="input-field resize-none mb-3"
            />
            <button
              onClick={handleSaveFeedback}
              disabled={savingFeedback}
              className="btn-primary text-xs px-4 py-2.5"
            >
              {savingFeedback ? <><Spinner /> Saving…</> : "Save Feedback"}
            </button>
          </div>
        </div>

        {/* ── Right: Info panel ── */}
        <div className="space-y-4">

          {/* Client info */}
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Client</p>
            <p className="text-white font-semibold text-sm font-helvetica">{ticket.client.name}</p>
            <p className="text-white/40 text-xs font-helvetica mt-0.5">{ticket.client.contact}</p>
          </div>

          {/* Assignment */}
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Assigned To</p>
            <p className="text-white font-semibold text-sm font-helvetica">{ticket.assignedName}</p>
            {canManage && (
              <div className="mt-3 space-y-2">
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="input-field text-xs py-2"
                >
                  <option value="">Reassign to…</option>
                  {staff.map((s) => (
                    <option key={s.uid} value={s.uid} className="bg-primary-dark">
                      {s.displayName} ({s.role})
                    </option>
                  ))}
                </select>
                {newAssignee && (
                  <button
                    onClick={handleReassign}
                    className="w-full text-xs text-accent border border-accent/30 hover:bg-accent/10 py-1.5 rounded-lg font-helvetica transition-colors"
                  >
                    Confirm Reassign
                  </button>
                )}
              </div>
            )}
          </div>

          {/* SLA info */}
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">SLA Deadline</p>
            <p className="text-white text-sm font-helvetica">{formatDateTime(ticket.slaDeadline)}</p>
            <span className={cn("mt-2 inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", SLA_STATUS_STYLES[sla])}>
              {formatTimeLeft(ticket.slaDeadline)}
            </span>
            {ticket.slaOverrideReason && (
              <p className="mt-3 text-[11px] text-white/30 font-helvetica leading-relaxed">
                Overridden by {ticket.slaOverriddenBy} on {ticket.slaOverriddenAt && formatDateTime(ticket.slaOverriddenAt)} — {ticket.slaOverrideReason}
              </p>
            )}
            {canManage && (
              showOverrideForm ? (
                <div className="mt-4 space-y-2">
                  <input
                    type="datetime-local"
                    value={overrideDeadline}
                    onChange={(e) => setOverrideDeadline(e.target.value)}
                    className="input-field text-xs"
                  />
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for overriding this deadline (required)"
                    rows={2}
                    className="input-field text-xs resize-none"
                  />
                  {overrideError && <p className="text-xs text-red-400">{overrideError}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleOverrideDeadline} disabled={savingOverride} className="btn-primary text-xs px-3 py-2 flex-1 disabled:opacity-50">
                      {savingOverride ? "Saving…" : "Confirm Override"}
                    </button>
                    <button onClick={() => { setShowOverrideForm(false); setOverrideError(null); }} className="text-xs px-3 py-2 text-white/30 hover:text-white/60 border border-white/10 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setOverrideDeadline(toDatetimeLocalValue(ticket.slaDeadline)); setShowOverrideForm(true); }}
                  className="mt-4 w-full text-xs px-3 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-colors font-helvetica"
                >
                  Override Deadline
                </button>
              )
            )}
          </div>

          {/* Escalate to Project */}
          {canManage && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Escalation</p>
              <p className="text-xs text-white/30 font-helvetica mb-3">Turn this ticket into a project or view related projects.</p>
              <div className="space-y-2">
                <Link
                  href={`/dashboard/projects/new?from_ticket=${ticket.ticketId}&client=${encodeURIComponent(ticket.client.name)}&name=${encodeURIComponent(ticket.title)}`}
                  className="flex items-center gap-2 w-full text-xs text-secondary border border-secondary/20 hover:bg-secondary/10 px-3 py-2 rounded-lg font-helvetica transition-colors"
                >
                  <span>📋</span> Create Project from Ticket
                </Link>
                <Link
                  href="/dashboard/projects"
                  className="flex items-center gap-2 w-full text-xs text-white/40 border border-white/10 hover:bg-white/5 px-3 py-2 rounded-lg font-helvetica transition-colors"
                >
                  <span>🔗</span> View All Projects
                </Link>
              </div>
            </div>
          )}

          {/* Status actions */}
          {canManage && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Update Status</p>
              <div className="space-y-2">
                {(["open", "in_progress", "resolved", "closed"] as TicketStatus[]).filter(
                  (s) => s !== ticket.status
                ).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      "w-full text-xs px-3 py-2 rounded-lg border font-helvetica transition-colors text-left",
                      STATUS_STYLES[s],
                      "hover:opacity-80"
                    )}
                  >
                    → {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="surface-card p-5 space-y-2">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Timeline</p>
            <InfoRow label="Created"  value={formatDateTime(ticket.createdAt)} />
            <InfoRow label="Updated"  value={formatDateTime(ticket.updatedAt)} />
            {ticket.resolvedAt && <InfoRow label="Resolved" value={formatDateTime(ticket.resolvedAt)} />}
            {ticket.closedAt   && <InfoRow label="Closed"   value={formatDateTime(ticket.closedAt)} />}
          </div>
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
function BackIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>;
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
