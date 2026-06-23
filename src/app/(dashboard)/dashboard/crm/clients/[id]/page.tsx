"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getClient, updateClientNotes } from "@/lib/crm-service";
import { getInvoices } from "@/lib/finance-service";
import { getTickets } from "@/lib/tickets-service";
import type { Client } from "@/types/crm";
import type { Invoice } from "@/types/finance";
import type { Ticket } from "@/types/tickets";
import { formatNaira, formatDate } from "@/types/finance";
import { PRIORITY_STYLES, PRIORITY_LABELS, STATUS_STYLES, STATUS_LABELS } from "@/types/tickets";
import { cn } from "@/lib/utils";

export default function ClientProfilePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [client, setClient]     = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notes, setNotes]       = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!client) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Client not found.</p></div>;
  }

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
          <div className="grid grid-cols-2 gap-4 text-center">
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
            <div className="flex items-center justify-between">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Subscriptions</h3>
              <Link href={`/dashboard/subscriptions/new?clientId=${client.id}`} className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors">
                + Add Subscription
              </Link>
            </div>
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
