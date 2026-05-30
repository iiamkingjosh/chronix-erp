"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { createPO, getVendors } from "@/lib/procurement-service";
import { generatePONumber } from "@/types/procurement";
import type { Vendor, POItem } from "@/types/procurement";
import { formatNaira } from "@/types/finance";

const itemSchema = z.object({
  name:      z.string().min(1, "Required"),
  quantity:  z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

const schema = z.object({
  vendorId:     z.string().min(1, "Required"),
  deliveryDate: z.string().min(1, "Required"),
  notes:        z.string().optional(),
  items:        z.array(itemSchema).min(1, "Add at least one item"),
});

type FormData = z.infer<typeof schema>;

function calcItemTotal(qty: number | string, price: number | string): number {
  return (Number(qty) || 0) * (Number(price) || 0);
}

export default function NewPOPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [vendors, setVendors]     = useState<Vendor[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:procurement") : false;

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: "",
      items: [{ name: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = useWatch({ control, name: "items" });
  const watchedVendorId = useWatch({ control, name: "vendorId" }) ?? "";

  const subtotal = (watchedItems ?? []).reduce(
    (s, item) => s + calcItemTotal(item.quantity, item.unitPrice), 0
  );

  useEffect(() => {
    getVendors().then((v) => setVendors(v.filter((vnd) => vnd.status === "active"))).catch((e) => console.error("Failed to load vendors:", e));
  }, []);

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    setServerError(null);
    try {
      const selectedVendor = vendors.find((v) => v.id === data.vendorId);
      const items: POItem[] = data.items.map((item, i) => ({
        id:        String(i),
        name:      item.name,
        quantity:  Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total:     calcItemTotal(item.quantity, item.unitPrice),
      }));
      const now = new Date().toISOString();
      const po = await createPO({
        poNumber:     generatePONumber(),
        vendorId:     data.vendorId,
        vendorName:   selectedVendor?.companyName ?? "",
        items,
        subtotal,
        total: subtotal,
        status:       "pending",
        deliveryDate: data.deliveryDate,
        notes:        data.notes || undefined,
        createdAt:    now,
        createdBy:    profile.uid,
        updatedAt:    now,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "procurement", entityId: po.id, entityRef: po.poNumber, details: `Purchase order ${po.poNumber} created for ${selectedVendor?.companyName ?? data.vendorId} — ₦${subtotal.toLocaleString()}`, timestamp: now });
      router.push(`/dashboard/procurement/orders`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create PO");
    }
  }

  if (!canManage) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">You do not have permission to create purchase orders.</p></div>;
  }

  const selectedVendor = vendors.find((v) => v.id === watchedVendorId);

  return (
    <div className="animate-fade-in max-w-4xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main */}
          <div className="lg:col-span-2 space-y-5">

            {/* Vendor & delivery */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Order Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Vendor</label>
                  <select {...register("vendorId")} className="input-field">
                    <option value="">Select vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id} className="bg-primary-dark">{v.companyName}</option>
                    ))}
                  </select>
                  {errors.vendorId && <p className="mt-1 text-xs text-red-400">{errors.vendorId.message}</p>}
                  {selectedVendor && (
                    <p className="mt-1 text-[10px] text-white/30 font-helvetica">
                      Terms: {selectedVendor.paymentTerms || "Not specified"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="field-label">Expected Delivery Date</label>
                  <input {...register("deliveryDate")} type="date" className="input-field" />
                  {errors.deliveryDate && <p className="mt-1 text-xs text-red-400">{errors.deliveryDate.message}</p>}
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Items</h3>
              <div className="hidden sm:grid sm:grid-cols-[1fr_80px_120px_110px_36px] gap-2 mb-2">
                {["Item / Description", "Qty", "Unit Price (₦)", "Total", ""].map((h) => (
                  <p key={h} className="text-[10px] font-semibold text-white/25 uppercase tracking-wider font-helvetica">{h}</p>
                ))}
              </div>
              <div className="space-y-2">
                {fields.map((field, i) => {
                  const total = calcItemTotal(watchedItems?.[i]?.quantity ?? 0, watchedItems?.[i]?.unitPrice ?? 0);
                  return (
                    <div key={field.id} className="grid grid-cols-[1fr_64px_96px_36px] sm:grid-cols-[1fr_80px_120px_110px_36px] gap-2 items-start">
                      <input {...register(`items.${i}.name`)} placeholder="Item name" className="input-field py-2.5 text-sm" />
                      <input {...register(`items.${i}.quantity`)} type="number" min="1" placeholder="1" className="input-field py-2.5 text-sm text-center" />
                      <input {...register(`items.${i}.unitPrice`)} type="number" min="0" step="any" placeholder="0.00" className="input-field py-2.5 text-sm text-right" />
                      <div className="hidden sm:flex input-field py-2.5 text-sm text-right pointer-events-none text-white/50 items-center justify-end">
                        {formatNaira(total)}
                      </div>
                      <button type="button" onClick={() => remove(i)} disabled={fields.length === 1}
                        className="w-9 h-9 flex items-center justify-center text-white/20 hover:text-red-400 disabled:opacity-20 transition-colors rounded-lg border border-white/5 hover:border-red-500/20 shrink-0">
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
              {errors.items?.message && <p className="mt-2 text-xs text-red-400">{errors.items.message}</p>}
              <button type="button" onClick={() => append({ name: "", quantity: 1, unitPrice: 0 })}
                className="mt-4 flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 font-helvetica transition-colors">
                <PlusSmIcon /> Add Item
              </button>
            </div>

            {/* Notes */}
            <div className="surface-card p-6">
              <label className="field-label">Notes (optional)</label>
              <textarea {...register("notes")} rows={3} placeholder="Special delivery instructions, specifications…" className="input-field resize-none" />
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-4">
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Summary</h3>
              {selectedVendor && (
                <div className="mb-4 pb-4 border-b border-white/10">
                  <p className="text-xs text-white/30 font-helvetica mb-1">Vendor</p>
                  <p className="text-sm text-white font-helvetica font-semibold">{selectedVendor.companyName}</p>
                  <p className="text-xs text-white/30 font-helvetica">{selectedVendor.contactPerson}</p>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-helvetica">
                  <span className="text-white/50">Items ({fields.length})</span>
                  <span className="text-white">{formatNaira(subtotal)}</span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between">
                  <span className="font-orbitron text-sm font-semibold text-white">Total</span>
                  <span className="font-orbitron text-sm font-bold text-accent">{formatNaira(subtotal)}</span>
                </div>
              </div>
            </div>

            {serverError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? <><Spinner /> Creating PO…</> : "Create Purchase Order"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TrashIcon()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function PlusSmIcon() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function Spinner()    { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
