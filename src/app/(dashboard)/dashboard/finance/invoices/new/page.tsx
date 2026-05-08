"use client";

import { useState, Suspense } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createInvoice } from "@/lib/finance-service";
import { generateInvoiceNumber, today, addDays, formatNaira, VAT_RATE, COMPANY } from "@/types/finance";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

const lineItemSchema = z.object({
  name:      z.string().min(1, "Required"),
  unitPrice: z.coerce.number().min(0, "Must be ≥ 0"),
  quantity:  z.coerce.number().int().min(1, "Must be ≥ 1"),
});

const schema = z.object({
  invoiceNumber: z.string().min(1, "Required"),
  invoiceDate:   z.string().min(1, "Required"),
  dueDate:       z.string().min(1, "Required"),
  salesperson:   z.string().min(1, "Required"),
  clientName:    z.string().min(1, "Required"),
  clientAddress: z.string().min(1, "Required"),
  clientPhone:   z.string().min(1, "Required"),
  items:         z.array(lineItemSchema).min(1, "Add at least one item"),
  notes:         z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function calcLineTotal(unitPrice: number | string, quantity: number | string): number {
  return (Number(unitPrice) || 0) * (Number(quantity) || 0);
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <NewInvoiceForm />
    </Suspense>
  );
}

function NewInvoiceForm() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitMode, setSubmitMode] = useState<"draft" | "submit">("submit");
  const canApprove = profile ? hasPermission(profile.role, "manage:finance") && (profile.role === "CFO" || profile.role === "CEO") : false;

  /* Pre-fill from URL params — used by subscription renewal + CRM links */
  const prefillClient      = searchParams.get("client") ?? "";
  const prefillAddress     = searchParams.get("address") ?? "";
  const prefillPhone       = searchParams.get("phone") ?? "";
  const prefillDescription = searchParams.get("description") ?? "";
  const prefillAmount      = Number(searchParams.get("amount")) || 0;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      invoiceNumber: generateInvoiceNumber(),
      invoiceDate:   today(),
      dueDate:       addDays(today(), 30),
      salesperson:   profile?.displayName ?? "",
      clientName:    prefillClient,
      clientAddress: prefillAddress,
      clientPhone:   prefillPhone,
      items:         [{ name: prefillDescription, unitPrice: prefillAmount, quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = useWatch({ control, name: "items" });

  const subtotal  = (watchedItems ?? []).reduce(
    (s, item) => s + calcLineTotal(item.unitPrice, item.quantity), 0
  );
  const vatAmount = subtotal * VAT_RATE;
  const total     = subtotal + vatAmount;

  async function onSubmit(data: FormData) {
    if (!profile) return;
    setServerError(null);
    try {
      const items = data.items.map((item, i) => ({
        id:        String(i),
        name:      item.name,
        unitPrice: Number(item.unitPrice),
        quantity:  Number(item.quantity),
        lineTotal: calcLineTotal(item.unitPrice, item.quantity),
      }));

      const isDraft     = submitMode === "draft";
      const approvalStatus = canApprove ? "approved" : isDraft ? "draft" : "pending_approval";
      const inv = await createInvoice({
        invoiceNumber: data.invoiceNumber,
        invoiceDate:   data.invoiceDate,
        dueDate:       data.dueDate,
        status:        "pending",
        approvalStatus,
        ...(approvalStatus === "pending_approval" ? { submittedBy: profile.displayName ?? profile.email, submittedAt: new Date().toISOString() } : {}),
        ...(approvalStatus === "approved" ? { approvedBy: profile.displayName ?? profile.email, approvedAt: new Date().toISOString() } : {}),
        client: {
          name:    data.clientName,
          address: data.clientAddress,
          phone:   data.clientPhone,
        },
        salesperson: data.salesperson,
        items,
        subtotal,
        vatRate:   VAT_RATE,
        vatAmount,
        total,
        ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
        createdAt: new Date().toISOString(),
        createdBy: profile.uid,
      });

      router.push(`/dashboard/finance/invoices/${inv.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create invoice");
    }
  }

  return (
    <div className="animate-fade-in max-w-5xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left / Main ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Invoice metadata */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
                Invoice Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Invoice #</label>
                  <input {...register("invoiceNumber")} className="input-field" />
                  {errors.invoiceNumber && (
                    <p className="mt-1 text-xs text-red-400">{errors.invoiceNumber.message}</p>
                  )}
                </div>
                <div>
                  <label className="field-label">Invoice Date</label>
                  <input {...register("invoiceDate")} type="date" className="input-field" />
                </div>
                <div>
                  <label className="field-label">Due Date</label>
                  <input {...register("dueDate")} type="date" className="input-field" />
                </div>
              </div>
            </div>

            {/* Client details */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
                Bill To
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="field-label">Client / Company Name</label>
                  <input
                    {...register("clientName")}
                    placeholder="e.g. Mainland Oil and Gas"
                    className="input-field"
                  />
                  {errors.clientName && (
                    <p className="mt-1 text-xs text-red-400">{errors.clientName.message}</p>
                  )}
                </div>
                <div>
                  <label className="field-label">Address</label>
                  <input
                    {...register("clientAddress")}
                    placeholder="e.g. 3 Modupe Odunlami, Oniru Lekki"
                    className="input-field"
                  />
                  {errors.clientAddress && (
                    <p className="mt-1 text-xs text-red-400">{errors.clientAddress.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Phone</label>
                    <input
                      {...register("clientPhone")}
                      placeholder="+234 810 185 4402"
                      className="input-field"
                    />
                    {errors.clientPhone && (
                      <p className="mt-1 text-xs text-red-400">{errors.clientPhone.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="field-label">Salesperson</label>
                    <input
                      {...register("salesperson")}
                      placeholder="Full name"
                      className="input-field"
                    />
                    {errors.salesperson && (
                      <p className="mt-1 text-xs text-red-400">{errors.salesperson.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
                Line Items
              </h3>

              {/* Column headers */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_130px_80px_110px_36px] gap-2 mb-2">
                {["Item Description", "Unit Price (₦)", "Qty", "Line Total", ""].map((h) => (
                  <p key={h} className="text-[10px] font-semibold text-white/25 uppercase tracking-wider font-helvetica">
                    {h}
                  </p>
                ))}
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {fields.map((field, i) => {
                  const lt = calcLineTotal(
                    watchedItems?.[i]?.unitPrice ?? 0,
                    watchedItems?.[i]?.quantity ?? 0
                  );
                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[1fr_90px_72px_80px_36px] sm:grid-cols-[1fr_130px_80px_110px_36px] gap-2 items-start"
                    >
                      <input
                        {...register(`items.${i}.name`)}
                        placeholder="Item name"
                        className="input-field py-2.5 text-sm"
                      />
                      <input
                        {...register(`items.${i}.unitPrice`)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="input-field py-2.5 text-sm text-right"
                      />
                      <input
                        {...register(`items.${i}.quantity`)}
                        type="number"
                        min="1"
                        placeholder="1"
                        className="input-field py-2.5 text-sm text-center"
                      />
                      <div className="flex input-field py-2.5 text-xs sm:text-sm text-right pointer-events-none text-white/50 items-center justify-end">
                        {formatNaira(lt)}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        disabled={fields.length === 1}
                        className="w-9 h-9 flex items-center justify-center text-white/20 hover:text-red-400 disabled:opacity-20 transition-colors rounded-lg border border-white/5 hover:border-red-500/20 shrink-0"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>

              {errors.items?.message && (
                <p className="mt-2 text-xs text-red-400">{errors.items.message}</p>
              )}

              <button
                type="button"
                onClick={() => append({ name: "", unitPrice: 0, quantity: 1 })}
                className="mt-4 flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 font-helvetica transition-colors"
              >
                <PlusSmIcon /> Add Line Item
              </button>
            </div>

            {/* Notes */}
            <div className="surface-card p-6">
              <label className="field-label">Notes (optional)</label>
              <textarea
                {...register("notes")}
                rows={3}
                placeholder="Payment terms, bank details reminder, special instructions…"
                className="input-field resize-none"
              />
            </div>
          </div>

          {/* ── Right / Summary ── */}
          <div className="space-y-4">

            {/* Totals */}
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
                Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-helvetica">
                  <span className="text-white/50">Subtotal</span>
                  <span className="text-white">{formatNaira(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-helvetica">
                  <span className="text-white/50">VAT (7.5%)</span>
                  <span className="text-white">{formatNaira(vatAmount)}</span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between">
                  <span className="font-orbitron text-sm font-semibold text-white">Total</span>
                  <span className="font-orbitron text-sm font-bold text-accent">{formatNaira(total)}</span>
                </div>
              </div>
            </div>

            {/* Bank details */}
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">
                Bank Details
              </p>
              <div className="space-y-1.5 text-xs font-helvetica">
                <p className="text-white/60">
                  <span className="text-white/30">Bank: </span>{COMPANY.bank.name}
                </p>
                <p className="text-white/60">
                  <span className="text-white/30">Account: </span>{COMPANY.bank.account}
                </p>
                <p className="text-white/60">
                  <span className="text-white/30">Name: </span>{COMPANY.bank.accountName}
                </p>
                <p className="text-white/60">
                  <span className="text-white/30">TIN: </span>{COMPANY.bank.tin}
                </p>
              </div>
            </div>

            {serverError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
              </div>
            )}

            {!canApprove && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSubmitMode("draft"); }}
                  className={cn("flex-1 text-xs py-2.5 rounded-xl border font-helvetica transition-colors", submitMode === "draft" ? "border-white/30 text-white bg-white/10" : "border-white/10 text-white/40 hover:text-white")}
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => { setSubmitMode("submit"); }}
                  className={cn("flex-1 text-xs py-2.5 rounded-xl border font-helvetica transition-colors", submitMode === "submit" ? "border-accent/30 text-accent bg-accent/10" : "border-white/10 text-white/40 hover:text-white")}
                >
                  Submit for Approval
                </button>
              </div>
            )}
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? (
                <><Spinner /> Creating…</>
              ) : canApprove ? (
                <><InvoiceIcon /> Create &amp; Approve</>
              ) : submitMode === "draft" ? (
                <><InvoiceIcon /> Save Draft</>
              ) : (
                <><InvoiceIcon /> Submit for Approval</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TrashIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function PlusSmIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function InvoiceIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
