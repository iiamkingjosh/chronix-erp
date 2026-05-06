"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { getPortalInvoices, getPortalTickets, getPortalSubscriptions } from "@/lib/client-portal-service";
import type { Invoice } from "@/types/finance";
import type { Ticket } from "@/types/tickets";
import type { Subscription } from "@/types/subscriptions";
import { formatNaira, formatDate } from "@/types/finance";
import { STATUS_LABELS, STATUS_STYLES } from "@/types/tickets";
import { getDaysLeft, getExpiryBand, EXPIRY_BAND_STYLES, formatDaysLeft, formatSubDate } from "@/types/subscriptions";
import { cn } from "@/lib/utils";

export default function PortalDashboard() {
  const { clientRecord, profile } = useClientAuth();
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [loading, setLoading]     = useState(true);

  const clientName = clientRecord?.company || clientRecord?.fullName || profile?.email || "";

  useEffect(() => {
    if (!clientName) return;
    Promise.all([
      getPortalInvoices(clientName),
      getPortalTickets(clientName),
      getPortalSubscriptions(clientName),
    ]).then(([inv, tkt, sub]) => {
      setInvoices(inv);
      setTickets(tkt);
      setSubs(sub);
    }).finally(() => setLoading(false));
  }, [clientName]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const openTickets     = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
  const unpaidInvoices  = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const expiringSubs    = subs.filter((s) => { const d = getDaysLeft(s.expiryDate); return d >= 0 && d <= 60; });

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="font-orbitron text-2xl font-bold text-white">
          Welcome back{clientRecord?.company ? `, ${clientRecord.company}` : ""}
        </h1>
        <p className="text-white/40 text-sm font-helvetica mt-1">
          Here&apos;s an overview of your services with Chronix Technology.
        </p>
      </div>

      {/* Alert banners */}
      {unpaidInvoices.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-amber-400">⚠</span>
          <p className="text-amber-400 text-sm font-helvetica">
            You have {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length !== 1 ? "s" : ""}.{" "}
            <Link href="/portal/invoices" className="underline hover:no-underline">View invoices →</Link>
          </p>
        </div>
      )}
      {expiringSubs.length > 0 && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-accent">🔔</span>
          <p className="text-accent text-sm font-helvetica">
            {expiringSubs.length} service{expiringSubs.length !== 1 ? "s" : ""} expiring within 60 days.{" "}
            <Link href="/portal/subscriptions" className="underline hover:no-underline">View renewals →</Link>
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Services",  value: subs.length,            color: "text-emerald-400" },
          { label: "Open Tickets",     value: openTickets.length,     color: openTickets.length > 0 ? "text-accent" : "text-white/40" },
          { label: "Unpaid Invoices",  value: unpaidInvoices.length,  color: unpaidInvoices.length > 0 ? "text-amber-400" : "text-white/40" },
          { label: "Expiring Soon",    value: expiringSubs.length,    color: expiringSubs.length > 0 ? "text-accent" : "text-white/40" },
        ].map((item) => (
          <div key={item.label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", item.color)}>{item.value}</p>
            <p className="text-white/40 text-xs font-helvetica mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent invoices */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
            <h2 className="font-orbitron text-xs font-semibold text-white/60 uppercase tracking-widest">Recent Invoices</h2>
            <Link href="/portal/invoices" className="text-xs text-accent hover:underline font-helvetica">View all</Link>
          </div>
          {invoices.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-white/20 font-helvetica">No invoices yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {invoices.slice(0, 4).map((inv) => (
                <Link key={inv.id} href={`/portal/invoices/${inv.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div>
                    <p className="text-sm text-white font-helvetica">{inv.invoiceNumber}</p>
                    <p className="text-xs text-white/30 font-helvetica">{formatDate(inv.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white font-helvetica">{formatNaira(inv.total)}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-helvetica",
                      inv.status === "paid" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                      inv.status === "overdue" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                      "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    )}>
                      {inv.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Open tickets */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
            <h2 className="font-orbitron text-xs font-semibold text-white/60 uppercase tracking-widest">Support Tickets</h2>
            <Link href="/portal/tickets" className="text-xs text-accent hover:underline font-helvetica">View all</Link>
          </div>
          {tickets.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-white/20 font-helvetica mb-3">No tickets yet.</p>
              <Link href="/portal/tickets/new" className="text-xs text-accent hover:underline font-helvetica">
                Submit a support request →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tickets.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-helvetica truncate">{t.title}</p>
                    <p className="text-xs text-white/30 font-helvetica">{t.ticketId}</p>
                  </div>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-helvetica shrink-0 ml-3", STATUS_STYLES[t.status])}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming renewals */}
      {expiringSubs.length > 0 && (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-orbitron text-xs font-semibold text-white/60 uppercase tracking-widest">Upcoming Renewals</h2>
          </div>
          <div className="divide-y divide-white/5">
            {expiringSubs.slice(0, 4).map((s) => {
              const band = getExpiryBand(s.expiryDate, s.cancelled);
              const days = getDaysLeft(s.expiryDate);
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm text-white font-helvetica">{s.itemName}</p>
                    <p className="text-xs text-white/30 font-helvetica">{formatSubDate(s.expiryDate)}</p>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-helvetica shrink-0", EXPIRY_BAND_STYLES[band])}>
                    {formatDaysLeft(days)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
