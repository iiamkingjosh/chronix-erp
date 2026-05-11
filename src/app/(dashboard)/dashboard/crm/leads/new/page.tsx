"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { createLead, getLeastLoadedStaff } from "@/lib/crm-service";
import { getStaffList, type StaffMember } from "@/lib/tickets-service";
import { notifyNewLead } from "@/lib/notifications-service";
import { SOURCE_LABELS, generateLeadId } from "@/types/crm";
import type { LeadSource } from "@/types/crm";

const schema = z.object({
  fullName:   z.string().min(2, "Required"),
  company:    z.string().optional(),
  email:      z.string().email("Valid email required"),
  phone:      z.string().min(7, "Required"),
  source:     z.enum(["manual", "form", "campaign", "referral", "social", "other"]),
  assignedTo: z.string().min(1, "Required"),
  notes:      z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const AUTO_ASSIGN_VALUE = "__auto__";

export default function AddLeadPage() {
  const { profile } = useAuth();
  const router      = useRouter();
  const [staff, setStaff]               = useState<StaffMember[]>([]);
  const [serverError, setServerError]   = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:crm") : false;

  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { source: "manual", assignedTo: profile?.uid ?? "" },
  });

  useEffect(() => {
    getStaffList().then(setStaff).catch((e) => console.error("Failed to load staff:", e));
  }, []);

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    setServerError(null);
    try {
      let assigneeUid  = data.assignedTo;
      let assigneeName = "";

      if (assigneeUid === AUTO_ASSIGN_VALUE) {
        const least = await getLeastLoadedStaff();
        assigneeUid  = least?.uid  ?? profile.uid;
        assigneeName = least?.displayName ?? profile.displayName ?? profile.email;
      } else {
        const member = staff.find((s) => s.uid === assigneeUid);
        assigneeName = member?.displayName ?? assigneeUid;
      }

      const lead = await createLead({
        leadId:       generateLeadId(),
        fullName:     data.fullName,
        company:      data.company ?? "",
        email:        data.email,
        phone:        data.phone,
        source:       data.source as LeadSource,
        stage:        "lead",
        assignedTo:   assigneeUid,
        assignedName: assigneeName,
        notes:        data.notes ?? "",
        activity: [{
          id:         crypto.randomUUID(),
          type:       "stage_change",
          content:    "Lead created",
          authorUid:  profile.uid,
          authorName: profile.displayName ?? profile.email,
          createdAt:  new Date().toISOString(),
        }],
        followUps:  [],
        createdAt:  new Date().toISOString(),
        createdBy:  profile.uid,
        updatedAt:  new Date().toISOString(),
      });

      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "crm", entityId: lead.id, entityRef: lead.fullName, details: `Lead created: ${lead.fullName} (${lead.company}) assigned to ${assigneeName}`, timestamp: new Date().toISOString() });
      notifyNewLead({ id: lead.id, fullName: lead.fullName, company: lead.company }).catch(() => {});
      router.push(`/dashboard/crm/leads/${lead.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create lead");
    }
  }

  if (!canManage) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">You do not have permission to add leads.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Contact info */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Contact Details</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Full Name</label>
                <input {...register("fullName")} placeholder="e.g. Emeka Okafor" className="input-field" />
                {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName.message}</p>}
              </div>
              <div>
                <label className="field-label">Company (optional)</label>
                <input {...register("company")} placeholder="e.g. Emeka Ventures Ltd" className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Email</label>
                <input {...register("email")} type="email" placeholder="emeka@example.com" className="input-field" />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input {...register("phone")} placeholder="+234 812 345 6789" className="input-field" />
                {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Source & assignment */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Source & Assignment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Lead Source</label>
              <select {...register("source")} className="input-field">
                {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([v, l]) => (
                  <option key={v} value={v} className="bg-primary-dark">{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Assign To</label>
              <select {...register("assignedTo")} className="input-field">
                <option value={AUTO_ASSIGN_VALUE} className="bg-primary-dark">⚡ Auto-assign (least loaded)</option>
                {staff.map((s) => (
                  <option key={s.uid} value={s.uid} className="bg-primary-dark">
                    {s.displayName} ({s.role})
                  </option>
                ))}
              </select>
              {errors.assignedTo && <p className="mt-1 text-xs text-red-400">{errors.assignedTo.message}</p>}
              <p className="mt-1 text-xs text-white/25 font-helvetica">
                Auto-assign picks the staff member with fewest active leads.
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="surface-card p-6">
          <label className="field-label">Notes (optional)</label>
          <textarea {...register("notes")} rows={4} placeholder="Initial conversation, context, pain points…" className="input-field resize-none" />
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><Spinner /> Adding Lead…</> : "Add Lead"}
        </button>
      </form>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
