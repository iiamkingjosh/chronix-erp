"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getSubscription, renewSubscription,
  cancelSubscription, updateSubscriptionNotes, toggleAutoRemind, setVatApplicable,
} from "@/lib/subscriptions-service";
import {
  SUB_TYPE_LABELS, SUB_PROVIDER_LABELS,
  EXPIRY_BAND_STYLES, EXPIRY_BAND_LABELS,
  getExpiryBand, getDaysLeft, formatDaysLeft,
  formatSubDate, formatSubDateTime,
} from "@/types/subscriptions";
import type { Subscription, SubType } from "@/types/subscriptions";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function SubscriptionDetailPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [sub, setSub]           = useState<Subscription | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notes, setNotes]       = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Renew form
  const [showRenew, setShowRenew]   = useState(false);
  const [newExpiry, setNewExpiry]   = useState("");
  const [renewAmount, setRenewAmount] = useState("");
  const [renewNotes, setRenewNotes] = useState("");
  const [renewing, setRenewing]       = useState(false);
  const [renewedInvoice, setRenewedInvoice] = useState<string | null>(null);
  const [renewError, setRenewError]   = useState<string | null>(null);

  const canManage = profile ? hasPermission(profile.role, "manage:subscriptions") : false;

  useEffect(() => {
    if (!id) return;
    getSubscription(id).then((s) => {
      setSub(s);
      if (s) setNotes(s.notes ?? "");
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleRenew() {
    if (!sub || !profile || !newExpiry) return;
    setRenewing(true);
    setRenewError(null);
    try {
      const { subscription, invoice } = await renewSubscription(sub.id, {
        newExpiry,
        amount:        Number(renewAmount) || 0,
        notes:         renewNotes || undefined,
        renewedBy:     profile.uid,
        renewedByName: profile.displayName ?? profile.email,
      });

      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "subscriptions", entityId: sub.id, entityRef: sub.itemName, details: `Subscription "${sub.itemName}" renewed to ${newExpiry}${invoice ? ` (invoice ${invoice.invoiceNumber})` : ""}`, timestamp: new Date().toISOString() });

      if (invoice) setRenewedInvoice(invoice.invoiceNumber);
      setSub(subscription);
      setNewExpiry(""); setRenewAmount(""); setRenewNotes("");
      setShowRenew(false);
    } catch (err) {
      // Fail-clean by design: if invoice creation failed, renewSubscription
      // throws before touching expiryDate/cancelled/renewalLog at all — the
      // subscription is genuinely unchanged, not just assumed so. Surface
      // this to the user instead of silently swallowing it (the old code
      // swallowed invoice failures while still committing the renewal).
      setRenewError(err instanceof Error ? err.message : "Failed to renew subscription.");
    } finally { setRenewing(false); }
  }

  async function handleCancel() {
    if (!sub || !profile) return;
    await cancelSubscription(sub.id);
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "subscriptions", entityId: sub.id, entityRef: sub.itemName, details: `Subscription "${sub.itemName}" cancelled`, timestamp: new Date().toISOString() });
    setSub((prev) => prev ? { ...prev, cancelled: true } : prev);
  }

  async function handleSaveNotes() {
    if (!sub) return;
    setSavingNotes(true);
    try { await updateSubscriptionNotes(sub.id, notes); }
    finally { setSavingNotes(false); }
  }

  async function handleToggleRemind() {
    if (!sub) return;
    await toggleAutoRemind(sub.id, !sub.autoRemind);
    setSub((prev) => prev ? { ...prev, autoRemind: !prev.autoRemind } : prev);
  }

  async function handleToggleVat() {
    if (!sub || !canManage) return;
    const next = sub.vatApplicable === false;
    await setVatApplicable(sub.id, next);
    setSub((prev) => prev ? { ...prev, vatApplicable: next } : prev);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!sub) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/40 font-helvetica">Subscription not found.</p>
        <button onClick={() => router.back()} className="mt-4 text-accent text-sm hover:underline font-helvetica">← Go back</button>
      </div>
    );
  }

  const band    = getExpiryBand(sub.expiryDate, sub.cancelled);
  const days    = getDaysLeft(sub.expiryDate);
  const sortedLog = [...sub.renewalLog].reverse();

  return (
    <div className="animate-fade-in max-w-5xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back to Subscriptions
      </button>

      {/* Header */}
      <div className="surface-card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-orbitron text-xs text-accent">{sub.subId}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", EXPIRY_BAND_STYLES[band])}>
                {EXPIRY_BAND_LABELS[band]}
              </span>
              {sub.autoRemind && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica bg-secondary/10 text-secondary border-secondary/20">
                  Auto-remind on
                </span>
              )}
              {sub.vatApplicable !== false ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  VAT Applied
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica bg-amber-500/10 text-amber-400 border-amber-500/20">
                  VAT Exempt
                </span>
              )}
            </div>
            <h2 className="font-orbitron text-xl font-bold text-white">{sub.itemName}</h2>
            {sub.clientName && <p className="text-white/40 text-sm font-helvetica mt-0.5">{sub.clientName}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className={cn("font-orbitron text-2xl font-bold", EXPIRY_BAND_STYLES[band].split(" ")[1])}>
              {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
            </p>
            <p className="text-white/30 text-xs font-helvetica">{formatDaysLeft(days)}</p>
          </div>
        </div>
      </div>

      {/* Renewal alert banner */}
      {(band === "expired" || band === "critical" || band === "warning") && !sub.cancelled && (
        <div className={cn(
          "flex items-center gap-3 px-5 py-4 rounded-xl border mb-6",
          band === "expired"  && "bg-red-500/10 border-red-500/30",
          band === "critical" && "bg-accent/10 border-accent/30",
          band === "warning"  && "bg-amber-500/10 border-amber-500/30",
        )}>
          <span className={cn("text-xl",
            band === "expired" ? "text-red-400" : band === "critical" ? "text-accent" : "text-amber-400"
          )}>⚠</span>
          <p className={cn("text-sm font-helvetica flex-1",
            band === "expired" ? "text-red-400" : band === "critical" ? "text-accent" : "text-amber-400"
          )}>
            {band === "expired"
              ? `This item expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago. Renew immediately.`
              : `This item expires in ${days} day${days !== 1 ? "s" : ""}. Schedule renewal now.`}
          </p>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowRenew(true)} className="text-xs font-helvetica font-semibold text-white bg-accent hover:bg-accent/90 px-4 py-2 rounded-lg transition-colors">
                Renew Now
              </button>
              {sub.clientName && (
                <Link
                  href={`/dashboard/finance/invoices/new?client=${encodeURIComponent(sub.clientName)}&description=${encodeURIComponent(`Renewal: ${sub.itemName}`)}&amount=${sub.renewalCost}`}
                  className="text-xs font-helvetica font-semibold text-secondary border border-secondary/30 hover:bg-secondary/10 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  + Create Invoice
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Renew form */}
          {showRenew && canManage && (
            <div className="surface-card p-6 border border-emerald-500/20 animate-slide-up">
              <h3 className="font-orbitron text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-4">Record Renewal</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="field-label">New Expiry Date</label>
                  <input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="field-label">Renewal Amount (₦)</label>
                  <input type="number" value={renewAmount} onChange={(e) => setRenewAmount(e.target.value)} placeholder="0" className="input-field" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Notes (optional)</label>
                  <input value={renewNotes} onChange={(e) => setRenewNotes(e.target.value)} placeholder="Invoice #, reference, notes…" className="input-field" />
                </div>
              </div>
              {renewError && (
                <p className="mb-3 text-xs text-red-400 font-helvetica">{renewError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={handleRenew} disabled={renewing || !newExpiry} className="btn-primary text-xs px-4 py-2.5">
                  {renewing ? <><Spinner /> Renewing…</> : "Confirm Renewal"}
                </button>
                <button onClick={() => setShowRenew(false)} className="text-xs text-white/40 hover:text-white font-helvetica transition-colors px-4">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Renewal invoice success banner */}
          {renewedInvoice && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl animate-fade-in">
              <p className="text-emerald-400 text-sm font-helvetica">
                Draft invoice <span className="font-semibold font-orbitron">{renewedInvoice}</span> created for this renewal.
              </p>
              <button onClick={() => setRenewedInvoice(null)} className="text-xs text-emerald-400/60 hover:text-emerald-400 font-helvetica">✕</button>
            </div>
          )}

          {/* Renewal log */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Renewal History ({sub.renewalLog.length})
            </h3>
            {sortedLog.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No renewals recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedLog.map((log) => (
                  <div key={log.id} className="px-4 py-3 bg-emerald-500/[0.04] border border-emerald-500/15 rounded-xl">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-emerald-400 font-helvetica">Renewed</span>
                      <span className="text-xs text-white/50 font-helvetica">{log.renewedByName}</span>
                      <span className="text-[10px] text-white/20 font-helvetica ml-auto">{formatSubDateTime(log.renewedAt)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-helvetica flex-wrap">
                      <span className="text-white/40">
                        {formatSubDate(log.previousExpiry)} → <span className="text-emerald-400">{formatSubDate(log.newExpiry)}</span>
                      </span>
                      {log.amount > 0 && (
                        <span className="text-secondary font-semibold">{formatNaira(log.amount)}</span>
                      )}
                      {log.notes && <span className="text-white/30">{log.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Credentials location, renewal process, account details…"
              className="input-field resize-none mb-3"
            />
            <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary text-xs px-4 py-2.5">
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Details</p>
            <div className="space-y-2 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Type: </span>{SUB_TYPE_LABELS[sub.type as SubType] ?? sub.type}</p>
              <p className="text-white/60"><span className="text-white/30">Provider: </span>{SUB_PROVIDER_LABELS[sub.provider as keyof typeof SUB_PROVIDER_LABELS] ?? sub.provider}</p>
              <p className="text-white/60"><span className="text-white/30">Start: </span>{formatSubDate(sub.startDate)}</p>
              <p className="text-white/60"><span className="text-white/30">Expiry: </span>{formatSubDate(sub.expiryDate)}</p>
              <p className="text-white/60"><span className="text-white/30">Cost: </span><span className="text-accent font-semibold">{formatNaira(sub.renewalCost)}</span></p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-white/60">
                  <span className="text-white/30">VAT: </span>
                  {sub.vatApplicable !== false
                    ? <span className="text-emerald-400">Applied (7.5%)</span>
                    : <span className="text-amber-400">Exempt</span>}
                </p>
                {canManage && (
                  <button
                    onClick={handleToggleVat}
                    className="text-[10px] text-white/30 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-2 py-0.5 rounded transition-colors"
                  >
                    Toggle
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Reminder toggle */}
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Reminders</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative" onClick={handleToggleRemind}>
                <div className={`w-10 h-5 rounded-full border transition-colors ${sub.autoRemind ? "bg-accent/30 border-accent/50" : "bg-white/10 border-white/20"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${sub.autoRemind ? "left-5 bg-accent" : "left-0.5 bg-white/30"}`} />
                </div>
              </div>
              <div>
                <p className="text-sm text-white font-helvetica">{sub.autoRemind ? "Enabled" : "Disabled"}</p>
                <p className="text-[10px] text-white/25 font-helvetica">Alert at 60, 30, 7, 1 days</p>
              </div>
            </label>
          </div>

          {/* Actions */}
          {canManage && (
            <div className="space-y-2">
              {!sub.cancelled && (
                <button
                  onClick={() => setShowRenew(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-helvetica transition-colors"
                >
                  <RefreshIcon /> Renew Subscription
                </button>
              )}
              <Link
                href="/dashboard/finance/invoices/new"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-secondary/30 text-secondary hover:bg-secondary/10 text-sm font-helvetica transition-colors"
              >
                <InvoiceIcon /> Generate Renewal Invoice
              </Link>
              {!sub.cancelled && (
                <button
                  onClick={handleCancel}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-helvetica transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </div>
          )}

          <div className="surface-card p-5 space-y-1.5 text-xs font-helvetica">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">History</p>
            <p className="text-white/40">Added {formatSubDateTime(sub.createdAt)}</p>
            <p className="text-white/40">Updated {formatSubDateTime(sub.updatedAt)}</p>
            <p className="text-white/40">{sub.renewalLog.length} renewal{sub.renewalLog.length !== 1 ? "s" : ""} recorded</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackIcon()    { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function RefreshIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>; }
function InvoiceIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>; }
function Spinner()     { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
