"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getClient, addSubscription, updateClientNotes } from "@/lib/crm-service";
import { getInvoices } from "@/lib/finance-service";
import { getTickets } from "@/lib/tickets-service";
import {
  SUB_STATUS_STYLES, formatCrmDateTime, formatCrmDate,
} from "@/types/crm";
import type { Client, ClientSubscription, SubStatus } from "@/types/crm";
import type { Invoice } from "@/types/finance";
import type { Ticket } from "@/types/tickets";
import { formatNaira, formatDate } from "@/types/finance";
import { PRIORITY_STYLES, PRIORITY_LABELS, STATUS_STYLES, STATUS_LABELS } from "@/types/tickets";
import { cn } from "@/lib/utils";

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [client, setClient]     = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notes, setNotes]       = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);

  // Subscription form state
  const [subName, setSubName]       = useState("");
  const [subType, setSubType]       = useState("Managed IT");
  const [subStart, setSubStart]     = useState(new Date().toISOString().split("T")[0]);
  const [subEnd, setSubEnd]         = useState("");
  const [subValue, setSubValue]     = useState("");
  const [subStatus, setSubStatus]   = useState<SubStatus>("active");
  const [addingSub, setAddingSub]   = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getClient(id), getInvoices(), getTickets()]).then(([c, invs, tkts]) => {
      setClient(c);
      if (c) {
        setNotes(c.notes ?? "");
        // Link by company name (case-insensitive)
        const co = c.company.toLowerCase();
        setInvoices(invs.filter((i) => i.client.name.toLowerCase().includes(co) || co.includes(i.client.name.toLowerCase())));
        setTickets(tkts.filter((t) => t.client.name.toLowerCase().includes(co) || co.includes(t.client.name.toLowerCase())));
      }
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleSaveNotes() {
    if (!client) return;
    setSavingNotes(true);
    try {
      await updateClientNotes(client.id, notes);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleAddSubscription() {
    if (!client || !subName) return;
    setAddingSub(true);
    try {
      const sub: ClientSubscription = {
        id:           Date.now().toString(),
        name:         subName,
        type:         subType,
        startDate:    subStart,
        endDate:      subEnd || undefined,
        monthlyValue: Number(subValue) || 0,
        status:       subStatus,
      };
      await addSubscription(client.id, sub);
      setClient((prev) => prev ? { ...prev, subscriptions: [...prev.subscriptions, sub] } : prev);
      setSubName(""); setSubValue(""); setSubEnd(""); setShowSubForm(false);
    } finally {
      setAddingSub(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!client) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Client not found.</p></div>;
  }

  const activeSubs = client.subscriptions.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce((s, sub) => s + sub.monthlyValue, 0);
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);

  return (
    <div className="animate-fade-in max-w-6xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back to Clients
      </button>

      {/* Header */}
      <div className="surface-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-orbitron text-xs text-accent">{client.clientId}</span>
            </div>
            <h2 className="font-orbitron text-xl font-bold text-white">{client.fullName}</h2>
            {client.company && <p className="text-white/40 text-sm font-helvetica">{client.company}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-orbitron text-lg font-bold text-emerald-400">{formatNaira(mrr)}</p>
              <p className="text-white/30 text-[10px] font-helvetica">Monthly Recurring</p>
            </div>
            <div>
              <p className="font-orbitron text-lg font-bold text-secondary">{formatNaira(totalInvoiced)}</p>
              <p className="text-white/30 text-[10px] font-helvetica">Total Invoiced</p>
            </div>
            <div>
              <p className="font-orbitron text-lg font-bold text-white">{tickets.length}</p>
              <p className="text-white/30 text-[10px] font-helvetica">Support Tickets</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Subscriptions */}
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Subscriptions</h3>
              <button onClick={() => setShowSubForm((v) => !v)} className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors">
                {showSubForm ? "Cancel" : "+ Add"}
              </button>
            </div>

            {showSubForm && (
              <div className="mb-5 p-4 bg-white/[0.03] border border-white/10 rounded-xl animate-slide-up">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="field-label">Service Name</label>
                    <input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Microsoft 365" className="input-field" />
                  </div>
                  <div>
                    <label className="field-label">Type</label>
                    <select value={subType} onChange={(e) => setSubType(e.target.value)} className="input-field">
                      {["Managed IT", "SaaS", "Support Retainer", "Cybersecurity", "Network", "Cloud", "Other"].map((t) => (
                        <option key={t} value={t} className="bg-primary-dark">{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Monthly Value (₦)</label>
                    <input type="number" value={subValue} onChange={(e) => setSubValue(e.target.value)} placeholder="0" className="input-field" />
                  </div>
                  <div>
                    <label className="field-label">Status</label>
                    <select value={subStatus} onChange={(e) => setSubStatus(e.target.value as SubStatus)} className="input-field">
                      <option value="active" className="bg-primary-dark">Active</option>
                      <option value="expired" className="bg-primary-dark">Expired</option>
                      <option value="cancelled" className="bg-primary-dark">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Start Date</label>
                    <input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="field-label">End Date (optional)</label>
                    <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} className="input-field" />
                  </div>
                </div>
                <button onClick={handleAddSubscription} disabled={addingSub || !subName} className="btn-primary text-xs px-4 py-2.5">
                  {addingSub ? <><Spinner /> Saving…</> : "Add Subscription"}
                </button>
              </div>
            )}

            {client.subscriptions.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No subscriptions recorded.</p>
            ) : (
              <div className="space-y-2">
                {client.subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-4 px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white font-helvetica">{sub.name}</p>
                      <p className="text-xs text-white/30 font-helvetica">{sub.type} · {formatCrmDate(sub.startDate)}{sub.endDate ? ` → ${formatCrmDate(sub.endDate)}` : ""}</p>
                    </div>
                    <p className="font-orbitron text-sm font-bold text-accent">{formatNaira(sub.monthlyValue)}<span className="text-white/30 text-xs font-helvetica font-normal">/mo</span></p>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", SUB_STATUS_STYLES[sub.status])}>
                      {sub.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Invoices</h3>
            {invoices.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No invoices linked.</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map((inv) => (
                  <Link key={inv.id} href={`/dashboard/finance/invoices/${inv.id}`} className="flex items-center gap-4 px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl hover:border-white/20 transition-colors">
                    <span className="font-orbitron text-xs text-accent">{inv.invoiceNumber}</span>
                    <span className="text-xs text-white/40 font-helvetica flex-1">{formatDate(inv.invoiceDate)}</span>
                    <span className="text-sm font-semibold text-white font-helvetica">{formatNaira(inv.total)}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize font-helvetica",
                      inv.status === "paid"    && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                      inv.status === "pending" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                      inv.status === "overdue" && "bg-red-500/15 text-red-400 border-red-500/30",
                    )}>
                      {inv.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Tickets */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Support Tickets</h3>
            {tickets.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No support tickets linked.</p>
            ) : (
              <div className="space-y-2">
                {tickets.slice(0, 5).map((tkt) => (
                  <Link key={tkt.id} href={`/dashboard/tickets/${tkt.id}`} className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/10 rounded-xl hover:border-white/20 transition-colors">
                    <span className="font-orbitron text-xs text-accent shrink-0">{tkt.ticketId}</span>
                    <span className="text-sm text-white/70 font-helvetica flex-1 line-clamp-1">{tkt.title}</span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PRIORITY_STYLES[tkt.priority])}>
                      {PRIORITY_LABELS[tkt.priority]}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STATUS_STYLES[tkt.status])}>
                      {STATUS_LABELS[tkt.status]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Contact</p>
            <div className="space-y-1.5 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Email: </span>{client.email}</p>
              <p className="text-white/60"><span className="text-white/30">Phone: </span>{client.phone}</p>
              {client.address && <p className="text-white/60"><span className="text-white/30">Address: </span>{client.address}</p>}
            </div>
          </div>

          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Account Manager</p>
            <p className="text-white text-sm font-helvetica font-semibold">{client.assignedName}</p>
          </div>

          {client.leadId && (
            <Link href={`/dashboard/crm/leads/${client.leadId}`} className="surface-card p-4 flex items-center gap-2 text-sm text-white/50 hover:text-accent font-helvetica transition-colors">
              <LinkIcon /> View Original Lead
            </Link>
          )}

          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Notes</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="input-field resize-none mb-2" />
            <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary text-xs w-full py-2.5">
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function LinkIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>; }
function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
