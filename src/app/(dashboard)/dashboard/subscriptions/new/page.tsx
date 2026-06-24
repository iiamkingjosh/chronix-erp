"use client";

import { useEffect, useState, Suspense } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { createSubscription } from "@/lib/subscriptions-service";
import { getClients } from "@/lib/crm-service";
import {
  SUB_TYPE_LABELS, SUB_PROVIDER_LABELS,
  generateSubId,
} from "@/types/subscriptions";
import type { SubType, SubProvider } from "@/types/subscriptions";
import type { Client as CRMClient } from "@/types/crm";

const COMMON_PROVIDERS: SubProvider[] = [
  "namecheap", "microsoft", "sophos", "google", "aws", "other",
];

const schema = z.object({
  itemName:      z.string().min(2, "Required"),
  clientId:      z.string().min(1, "Required"),
  type:          z.enum(["domain","license","contract","service","ssl","other"]),
  provider:      z.string().min(1, "Required"),
  startDate:     z.string().min(1, "Required"),
  expiryDate:    z.string().min(1, "Required"),
  renewalCost:   z.coerce.number().min(0),
  vatApplicable: z.boolean(),
  autoRemind:    z.boolean(),
  notes:         z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewSubscriptionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <NewSubscriptionForm />
    </Suspense>
  );
}

function NewSubscriptionForm() {
  const { profile } = useAuth();
  const router      = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients]         = useState<CRMClient[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [customProvider, setCustomProvider] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:subscriptions") : false;
  const prefillClientId = searchParams.get("clientId") ?? "";

  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type:          "domain",
      provider:      "namecheap",
      startDate:     new Date().toISOString().split("T")[0],
      autoRemind:    true,
      vatApplicable: true,
      renewalCost:   0,
    },
  });

  const autoRemindValue    = useWatch({ control, name: "autoRemind" });
  const vatApplicableValue = useWatch({ control, name: "vatApplicable" });
  const autoRemindOn    = !!autoRemindValue;
  const vatApplicableOn = vatApplicableValue !== false;

  useEffect(() => {
    getClients().then((cs) => {
      setClients(cs);
      if (prefillClientId && cs.some((c) => c.id === prefillClientId)) {
        setValue("clientId", prefillClientId);
      }
    }).catch((e) => console.error("Failed to load clients:", e)).finally(() => setClientsLoaded(true));
  }, [prefillClientId, setValue]);

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    const selectedClient = clients.find((c) => c.id === data.clientId);
    if (!selectedClient) {
      setServerError("Select a valid client.");
      return;
    }
    setServerError(null);
    try {
      const now = new Date().toISOString();
      const sub = await createSubscription({
        subId:         generateSubId(),
        itemName:      data.itemName,
        clientId:      selectedClient.id,
        clientName:    selectedClient.company || selectedClient.fullName,
        type:          data.type as SubType,
        provider:      data.provider,
        startDate:     data.startDate,
        expiryDate:    data.expiryDate,
        renewalCost:   data.renewalCost,
        vatApplicable: data.vatApplicable,
        autoRemind:    data.autoRemind,
        notes:         data.notes ?? "",
        renewalLog:    [],
        invoiceIds:    [],
        cancelled:     false,
        createdAt:     now,
        createdBy:     profile.uid,
        updatedAt:     now,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "subscriptions", entityId: sub.id, entityRef: sub.itemName, details: `Subscription created: ${data.itemName} (${data.type}) via ${data.provider}, expires ${data.expiryDate}`, timestamp: now });
      router.push(`/dashboard/subscriptions/${sub.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create subscription");
    }
  }

  if (!canManage) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">You do not have permission to add subscriptions.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Item details */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
            Item Details
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="field-label">Item Name</label>
                <input
                  {...register("itemName")}
                  placeholder="e.g. chronixtech.com, Microsoft 365 Business, Sophos XG"
                  className="input-field"
                />
                {errors.itemName && <p className="mt-1 text-xs text-red-400">{errors.itemName.message}</p>}
              </div>

              <div>
                <label className="field-label">Type</label>
                <select {...register("type")} className="input-field">
                  {(Object.entries(SUB_TYPE_LABELS) as [SubType, string][]).map(([v, l]) => (
                    <option key={v} value={v} className="bg-primary-dark">{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Provider</label>
                {!customProvider ? (
                  <div className="flex gap-2">
                    <select
                      {...register("provider")}
                      className="input-field flex-1"
                      onChange={(e) => {
                        if (e.target.value === "custom") { setCustomProvider(true); setValue("provider", ""); }
                        else register("provider").onChange(e);
                      }}
                    >
                      {COMMON_PROVIDERS.map((p) => (
                        <option key={p} value={p} className="bg-primary-dark capitalize">
                          {SUB_PROVIDER_LABELS[p as SubProvider] ?? p}
                        </option>
                      ))}
                      <option value="custom" className="bg-primary-dark">Custom…</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input {...register("provider")} placeholder="Provider name" className="input-field flex-1" />
                    <button
                      type="button"
                      onClick={() => { setCustomProvider(false); setValue("provider", "namecheap"); }}
                      className="text-xs text-white/30 hover:text-white font-helvetica px-2 transition-colors"
                    >
                      ←
                    </button>
                  </div>
                )}
                {errors.provider && <p className="mt-1 text-xs text-red-400">{errors.provider.message}</p>}
              </div>

              <div>
                <label className="field-label">Client</label>
                <select {...register("clientId")} className="input-field" disabled={!clientsLoaded}>
                  <option value="" className="bg-primary-dark">
                    {clientsLoaded ? "Select a client…" : "Loading clients…"}
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id} className="bg-primary-dark">
                      {c.company || c.fullName}
                    </option>
                  ))}
                </select>
                {errors.clientId && <p className="mt-1 text-xs text-red-400">{errors.clientId.message}</p>}
              </div>

              <div>
                <label className="field-label">Renewal Cost (₦)</label>
                <input {...register("renewalCost")} type="number" min="0" step="0.01" placeholder="0" className="input-field" />
              </div>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
            Dates & Reminders
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Start Date</label>
              <input {...register("startDate")} type="date" className="input-field" />
            </div>
            <div>
              <label className="field-label">Expiry Date</label>
              <input {...register("expiryDate")} type="date" className="input-field" />
              {errors.expiryDate && <p className="mt-1 text-xs text-red-400">{errors.expiryDate.message}</p>}
            </div>
          </div>

          <label className="flex items-center gap-3 mt-4 cursor-pointer group">
            <div className="relative">
              <input {...register("autoRemind")} type="checkbox" className="sr-only" />
              <div className={`w-10 h-5 rounded-full border transition-colors ${autoRemindOn ? "bg-accent/30 border-accent/50" : "bg-white/10 border-white/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${autoRemindOn ? "left-5 bg-accent" : "left-0.5 bg-white/30"}`} />
              </div>
            </div>
            <div>
              <p className="text-sm text-white font-helvetica">Auto Reminders</p>
              <p className="text-xs text-white/30 font-helvetica">Alert at 60, 30, 7 and 1 day before expiry</p>
            </div>
          </label>

          <label className="flex items-center gap-3 mt-3 cursor-pointer group">
            <div className="relative">
              <input {...register("vatApplicable")} type="checkbox" className="sr-only" />
              <div className={`w-10 h-5 rounded-full border transition-colors ${vatApplicableOn ? "bg-emerald-500/30 border-emerald-500/50" : "bg-white/10 border-white/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${vatApplicableOn ? "left-5 bg-emerald-400" : "left-0.5 bg-white/30"}`} />
              </div>
            </div>
            <div>
              <p className="text-sm text-white font-helvetica">Apply VAT (7.5%) on renewal invoices</p>
              <p className="text-xs text-white/30 font-helvetica">Disable for foreign/exempt vendors (Microsoft 365, AWS, etc.)</p>
            </div>
          </label>
        </div>

        {/* Notes */}
        <div className="surface-card p-6">
          <label className="field-label">Notes (optional)</label>
          <textarea
            {...register("notes")}
            rows={3}
            placeholder="Login credentials location, renewal instructions, account details…"
            className="input-field resize-none"
          />
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><Spinner /> Adding…</> : "Add Subscription"}
        </button>
      </form>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
