"use client";

import { useEffect, useState } from "react";
import { getPayments, getInvoices, createPayment } from "@/lib/finance-service";
import { formatNaira, formatDate, PAYMENT_METHOD_LABELS, today } from "@/types/finance";
import type { Invoice, Payment, PaymentMethod } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function PaymentsPage() {
  const { profile } = useAuth();
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  const canManage = profile ? hasPermission(profile.role, "manage:finance") : false;

  useEffect(() => {
    Promise.all([getPayments(), getInvoices()])
      .then(([pays, invs]) => { setPayments(pays); setInvoices(invs); })
      .finally(() => setLoading(false));
  }, []);

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");

  function onPaymentRecorded(p: Payment) {
    setPayments((prev) => [p, ...prev]);
    setInvoices((prev) =>
      prev.map((i) => (i.id === p.invoiceId ? { ...i, status: "paid" as const } : i))
    );
    setShowForm(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Total Collected</p>
          <p className="font-orbitron text-xl font-bold text-emerald-400">{formatNaira(totalCollected)}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">{payments.length} payment{payments.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Unpaid Invoices</p>
          <p className="font-orbitron text-xl font-bold text-amber-400">{unpaidInvoices.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">
            {formatNaira(unpaidInvoices.reduce((s, i) => s + i.total, 0))} outstanding
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Overdue</p>
          <p className="font-orbitron text-xl font-bold text-red-400">
            {invoices.filter((i) => i.status === "overdue").length}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">invoices past due date</p>
        </div>
      </div>

      {/* Header + record payment button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
          Payment History
        </h2>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              "btn-primary text-xs px-4 py-2.5 transition-all",
              showForm && "bg-white/10 text-white shadow-none hover:bg-white/15"
            )}
          >
            {showForm ? "Cancel" : <><PlusIcon /> Record Payment</>}
          </button>
        )}
      </div>

      {/* Record payment form */}
      {showForm && canManage && (
        <div className="surface-card p-6 mb-6 animate-slide-up">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
            Record a Payment
          </h3>
          <RecordPaymentForm
            unpaidInvoices={unpaidInvoices}
            profile={profile}
            onSuccess={onPaymentRecorded}
          />
        </div>
      )}

      {/* Payments list */}
      <div className="surface-card overflow-hidden">
        {payments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Invoice #</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Method</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Reference</th>
                  <th className="px-6 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-orbitron text-xs text-accent">{p.invoiceNumber}</td>
                    <td className="px-6 py-4 text-sm text-white font-helvetica">{p.clientName}</td>
                    <td className="px-6 py-4 text-xs text-white/40 font-helvetica">{formatDate(p.paymentDate)}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-white/60 font-helvetica bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                        {PAYMENT_METHOD_LABELS[p.method]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-white/40 font-helvetica">{p.reference || "—"}</td>
                    <td className="px-6 py-4 text-sm text-white font-semibold font-helvetica text-right">
                      {formatNaira(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Record Payment Form ── */
function RecordPaymentForm({
  unpaidInvoices,
  profile,
  onSuccess,
}: {
  unpaidInvoices: Invoice[];
  profile: ReturnType<typeof import("@/contexts/AuthContext").useAuth>["profile"];
  onSuccess: (p: Payment) => void;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentDate, setPaymentDate]              = useState(today());
  const [method, setMethod]                        = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference]                  = useState("");
  const [notes, setNotes]                          = useState("");
  const [submitting, setSubmitting]                = useState(false);
  const [error, setError]                          = useState<string | null>(null);

  const selectedInv = unpaidInvoices.find((i) => i.id === selectedInvoiceId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInv || !profile) return;
    setSubmitting(true);
    setError(null);
    try {
      const payment = await createPayment({
        invoiceId:     selectedInv.id,
        invoiceNumber: selectedInv.invoiceNumber,
        clientName:    selectedInv.client.name,
        amount:        selectedInv.total,
        paymentDate,
        method,
        reference:     reference || undefined,
        notes:         notes || undefined,
        recordedBy:    profile.uid,
        createdAt:     new Date().toISOString(),
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "invoices", entityId: selectedInv.id, entityRef: selectedInv.invoiceNumber, details: `Payment of ₦${selectedInv.total.toLocaleString()} recorded for invoice ${selectedInv.invoiceNumber}`, timestamp: new Date().toISOString() });
      onSuccess(payment);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (unpaidInvoices.length === 0) {
    return (
      <p className="text-white/40 text-sm font-helvetica">
        No unpaid invoices. All invoices are settled.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="field-label">Invoice</label>
          <select
            value={selectedInvoiceId}
            onChange={(e) => setSelectedInvoiceId(e.target.value)}
            required
            className="input-field"
          >
            <option value="">Select invoice…</option>
            {unpaidInvoices.map((inv) => (
              <option key={inv.id} value={inv.id} className="bg-primary-dark">
                {inv.invoiceNumber} — {inv.client.name} ({formatNaira(inv.total)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="input-field"
          />
        </div>

        <div>
          <label className="field-label">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="input-field"
          >
            {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([v, l]) => (
              <option key={v} value={v} className="bg-primary-dark">{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Reference (optional)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank transaction ref…"
            className="input-field"
          />
        </div>

        <div>
          <label className="field-label">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes…"
            className="input-field"
          />
        </div>

        {selectedInv && (
          <div className="flex items-end">
            <div className="w-full bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica mb-1">Amount to Record</p>
              <p className="font-orbitron text-lg font-bold text-accent">{formatNaira(selectedInv.total)}</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm font-helvetica">{error}</p>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={submitting || !selectedInvoiceId}
          className="btn-primary"
        >
          {submitting ? <><Spinner /> Recording…</> : <><CheckIcon /> Record Payment</>}
        </button>
      </div>
    </form>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function CheckIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m20 6-11 11-5-5"/></svg>;
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>;
}
