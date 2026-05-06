"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { getPortalTickets } from "@/lib/client-portal-service";
import type { Ticket } from "@/types/tickets";
import { STATUS_LABELS, STATUS_STYLES, PRIORITY_LABELS, PRIORITY_STYLES } from "@/types/tickets";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalTicketsPage() {
  const { clientRecord, profile } = useClientAuth();
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [loading, setLoading]     = useState(true);

  const clientName = clientRecord?.company || clientRecord?.fullName || profile?.email || "";

  useEffect(() => {
    if (!clientName) return;
    getPortalTickets(clientName).then(setTickets).finally(() => setLoading(false));
  }, [clientName]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const open     = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">Support Tickets</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Track your support requests</p>
        </div>
        <Link href="/portal/tickets/new" className="bg-accent hover:bg-accent/90 text-white text-xs font-semibold font-helvetica px-4 py-2.5 rounded-lg transition-colors">
          + New Ticket
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",    value: tickets.length, color: "text-white" },
          { label: "Open",     value: open,           color: open > 0 ? "text-accent" : "text-white/40" },
          { label: "Resolved", value: resolved,       color: "text-emerald-400" },
        ].map((item) => (
          <div key={item.label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", item.color)}>{item.value}</p>
            <p className="text-white/40 text-xs font-helvetica mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
        {tickets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica mb-3">No tickets yet.</p>
            <Link href="/portal/tickets/new" className="text-accent text-sm hover:underline font-helvetica">
              Submit your first support request →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {tickets.map((t) => (
              <div key={t.id} className="px-5 py-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white font-helvetica">{t.title}</p>
                  <p className="text-xs text-white/30 font-helvetica mt-0.5">{t.ticketId} · Opened {formatDate(t.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STATUS_STYLES[t.status])}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PRIORITY_STYLES[t.priority])}>
                    {PRIORITY_LABELS[t.priority]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
