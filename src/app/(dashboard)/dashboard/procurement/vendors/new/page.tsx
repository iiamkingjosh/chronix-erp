"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { createVendor } from "@/lib/procurement-service";
import { VENDOR_CATEGORY_LABELS, generateVendorId } from "@/types/procurement";
import type { VendorCategory } from "@/types/procurement";

const schema = z.object({
  companyName:    z.string().min(2, "Required"),
  contactPerson:  z.string().min(2, "Required"),
  email:          z.string().email("Valid email required"),
  phone:          z.string().min(7, "Required"),
  category:       z.enum(["hardware","software","services","consumables","logistics","other"]),
  paymentTerms:   z.string().optional(),
  notes:          z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddVendorPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:procurement") : false;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: "hardware" },
  });

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    setServerError(null);
    try {
      const now = new Date().toISOString();
      const vendor = await createVendor({
        vendorId:      generateVendorId(),
        companyName:   data.companyName,
        contactPerson: data.contactPerson,
        email:         data.email,
        phone:         data.phone,
        category:      data.category as VendorCategory,
        paymentTerms:  data.paymentTerms ?? "",
        status:        "active",
        ratings:       [],
        avgRating:     0,
        notes:         data.notes ?? "",
        createdAt:     now,
        createdBy:     profile.uid,
        updatedAt:     now,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "procurement", entityId: vendor.id, entityRef: vendor.companyName, details: `Vendor added: ${data.companyName} (${data.category})`, timestamp: now });
      router.push(`/dashboard/procurement/vendors/${vendor.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to add vendor");
    }
  }

  if (!canManage) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">You do not have permission to add vendors.</p></div>;
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Vendor Details</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Company Name</label>
                <input {...register("companyName")} placeholder="e.g. TechVault Nigeria Ltd" className="input-field" />
                {errors.companyName && <p className="mt-1 text-xs text-red-400">{errors.companyName.message}</p>}
              </div>
              <div>
                <label className="field-label">Contact Person</label>
                <input {...register("contactPerson")} placeholder="Primary contact name" className="input-field" />
                {errors.contactPerson && <p className="mt-1 text-xs text-red-400">{errors.contactPerson.message}</p>}
              </div>
              <div>
                <label className="field-label">Email</label>
                <input {...register("email")} type="email" placeholder="vendor@example.com" className="input-field" />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input {...register("phone")} placeholder="+234 812 345 6789" className="input-field" />
                {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Category</label>
                <select {...register("category")} className="input-field">
                  {(Object.entries(VENDOR_CATEGORY_LABELS) as [VendorCategory, string][]).map(([v, l]) => (
                    <option key={v} value={v} className="bg-primary-dark">{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Payment Terms</label>
                <input {...register("paymentTerms")} placeholder="e.g. Net 30, COD, 50% upfront" className="input-field" />
              </div>
            </div>
            <div>
              <label className="field-label">Notes (optional)</label>
              <textarea {...register("notes")} rows={3} placeholder="Additional details, delivery areas, specialties…" className="input-field resize-none" />
            </div>
          </div>
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><Spinner /> Adding Vendor…</> : "Add Vendor"}
        </button>
      </form>
    </div>
  );
}

function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
