"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { createTicket, getStaffList, type StaffMember } from "@/lib/tickets-service";
import {
  PRIORITY_LABELS, PRIORITY_STYLES,
  defaultSlaDeadline, generateTicketId,
} from "@/types/tickets";
import type { TicketPriority } from "@/types/tickets";
import { cn } from "@/lib/utils";

const schema = z.object({
  clientName:    z.string().min(1, "Required"),
  clientContact: z.string().min(1, "Required"),
  title:         z.string().min(3, "Minimum 3 characters"),
  description:   z.string().min(10, "Minimum 10 characters"),
  priority:      z.enum(["low", "medium", "high", "critical"]),
  assignedTo:    z.string().min(1, "Required"),
  slaDeadline:   z.string().min(1, "Required"),
});

type FormData = z.infer<typeof schema>;

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

function newTicketNoteId(): string {
  return crypto.randomUUID();
}

export default function NewTicketPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [staff, setStaff]           = useState<StaffMember[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:tickets") : false;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority:    "medium",
      slaDeadline: toDatetimeLocal(defaultSlaDeadline("medium")),
      assignedTo:  "",
    },
  });

  const watchPriority = (useWatch({ control, name: "priority" }) ?? "medium") as TicketPriority;

  // Auto-update SLA when priority changes
  useEffect(() => {
    setValue("slaDeadline", toDatetimeLocal(defaultSlaDeadline(watchPriority)));
  }, [watchPriority, setValue]);

  // Fetch staff list
  useEffect(() => {
    getStaffList().then(setStaff).catch(() => {});
  }, []);

  async function onSubmit(data: FormData) {
    if (!profile) return;
    if (!canManage) return;
    setServerError(null);
    try {
      const selectedStaff = staff.find((s) => s.uid === data.assignedTo);
      const ticket = await createTicket({
        ticketId:     generateTicketId(),
        client:       { name: data.clientName, contact: data.clientContact },
        title:        data.title,
        description:  data.description,
        priority:     data.priority as TicketPriority,
        status:       "open",
        assignedTo:   data.assignedTo,
        assignedName: selectedStaff?.displayName ?? data.assignedTo,
        slaDeadline:  new Date(data.slaDeadline).toISOString(),
        notes: [{
          id:         newTicketNoteId(),
          authorUid:  profile.uid,
          authorName: profile.displayName ?? profile.email,
          content:    "Ticket created",
          type:       "status_change",
          createdAt:  new Date().toISOString(),
        }],
        createdAt:    new Date().toISOString(),
        createdBy:    profile.uid,
        updatedAt:    new Date().toISOString(),
      });
      router.push(`/dashboard/tickets/${ticket.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  }

  if (!canManage) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">You do not have permission to create tickets.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Client details */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Client</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Client / Company Name</label>
              <input {...register("clientName")} placeholder="e.g. Mainland Oil and Gas" className="input-field" />
              {errors.clientName && <p className="mt-1 text-xs text-red-400">{errors.clientName.message}</p>}
            </div>
            <div>
              <label className="field-label">Contact (email or phone)</label>
              <input {...register("clientContact")} placeholder="e.g. +234 810 185 4402" className="input-field" />
              {errors.clientContact && <p className="mt-1 text-xs text-red-400">{errors.clientContact.message}</p>}
            </div>
          </div>
        </div>

        {/* Issue details */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Issue</h3>
          <div className="space-y-4">
            <div>
              <label className="field-label">Issue Title</label>
              <input {...register("title")} placeholder="Brief summary of the issue" className="input-field" />
              {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title.message}</p>}
            </div>
            <div>
              <label className="field-label">Description</label>
              <textarea
                {...register("description")}
                rows={5}
                placeholder="Detailed description of the issue, steps to reproduce, impact…"
                className="input-field resize-none"
              />
              {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>}
            </div>
          </div>
        </div>

        {/* Priority, assignment, SLA */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Assignment & Priority</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Priority */}
            <div>
              <label className="field-label">Priority</label>
              <div className="grid grid-cols-2 gap-2">
                {(["critical", "high", "medium", "low"] as TicketPriority[]).map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-helvetica",
                      watchPriority === p
                        ? PRIORITY_STYLES[p]
                        : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/60"
                    )}
                  >
                    <input {...register("priority")} type="radio" value={p} className="sr-only" />
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      p === "critical" && "bg-red-400",
                      p === "high"     && "bg-accent",
                      p === "medium"   && "bg-secondary",
                      p === "low"      && "bg-white/30",
                    )} />
                    {PRIORITY_LABELS[p]}
                  </label>
                ))}
              </div>
              {errors.priority && <p className="mt-1 text-xs text-red-400">{errors.priority.message}</p>}
            </div>

            <div className="space-y-4">
              {/* Assigned staff */}
              <div>
                <label className="field-label">Assign To</label>
                <select {...register("assignedTo")} className="input-field">
                  <option value="">Select staff member…</option>
                  {staff.map((s) => (
                    <option key={s.uid} value={s.uid} className="bg-primary-dark">
                      {s.displayName} ({s.role})
                    </option>
                  ))}
                </select>
                {errors.assignedTo && <p className="mt-1 text-xs text-red-400">{errors.assignedTo.message}</p>}
              </div>

              {/* SLA deadline */}
              <div>
                <label className="field-label">SLA Deadline</label>
                <input {...register("slaDeadline")} type="datetime-local" className="input-field" />
                <p className="mt-1 text-[10px] text-white/25 font-helvetica">Auto-set from priority · adjustable</p>
              </div>
            </div>
          </div>
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><Spinner /> Creating Ticket…</> : <><TicketIcon /> Create Ticket</>}
        </button>
      </form>
    </div>
  );
}

function TicketIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>;
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
