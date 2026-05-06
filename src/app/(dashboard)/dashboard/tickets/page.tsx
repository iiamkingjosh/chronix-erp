"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTickets } from "@/lib/tickets-service";
import {
  PRIORITY_LABELS, PRIORITY_STYLES,
  STATUS_LABELS, STATUS_STYLES,
  getSlaStatus, SLA_STATUS_STYLES, formatTimeLeft, formatDateTime,
} from "@/types/tickets";
import type { Ticket, TicketPriority, TicketStatus } from "@/types/tickets";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

type PriorityFilter = "all" | TicketPriority;
type StatusFilter   = "all" | TicketStatus;

export default function TicketsPage() {
  const { profile } = useAuth();
  const [tickets, setTickets]           = useState<Ticket[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [priorityFilter, setPriority]   = useState<PriorityFilter>("all");
  const [statusFilter, setStatus]       = useState<StatusFilter>("all");

  const canManage  = profile ? hasPermission(profile.role, "manage:tickets") : false;
  const canSeeAll  = profile ? hasPermission(profile.role, "view:all") || canManage : false;

  useEffect(() => {
    getTickets()
      .then((all) => {
        if (!canSeeAll && profile) {
          setTickets(all.filter((t) => t.assignedTo === profile.uid));
        } else {
          setTickets(all);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, canSeeAll]);

  const filtered = tickets.filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (statusFilter   !== "all" && t.status   !== statusFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.ticketId.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.client.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    open:        tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved:    tickets.filter((t) => t.status === "resolved").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total",       value: tickets.length,    color: "text-white" },
          { label: "Open",        value: counts.open,       color: "text-blue-400" },
          { label: "In Progress", value: counts.in_progress,color: "text-amber-400" },
          { label: "Resolved",    value: counts.resolved,   color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="surface-card px-4 py-3 text-center">
            <p className={cn("font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search tickets, clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>

        {/* Priority filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "critical", "high", "medium", "low"] as PriorityFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica transition-colors border capitalize",
                priorityFilter === p
                  ? p === "all"
                    ? "bg-white/10 text-white border-white/20"
                    : cn(PRIORITY_STYLES[p as TicketPriority])
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {p === "all" ? "All" : PRIORITY_LABELS[p as TicketPriority]}
            </button>
          ))}
        </div>

        {canManage && (
          <Link href="/dashboard/tickets/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> New Ticket
          </Link>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {(["all", "open", "in_progress", "resolved", "closed"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg font-helvetica transition-colors border",
              statusFilter === s
                ? s === "all"
                  ? "bg-white/10 text-white border-white/20"
                  : cn(STATUS_STYLES[s as TicketStatus])
                : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
            )}
          >
            {s === "all" ? `All (${tickets.length})` : STATUS_LABELS[s as TicketStatus]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {tickets.length === 0 ? "No tickets yet." : "No tickets match your filters."}
            </p>
            {canManage && tickets.length === 0 && (
              <Link href="/dashboard/tickets/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Create first ticket →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Ticket ID</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Issue</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Priority</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned To</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">SLA</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((ticket) => {
                  const sla = getSlaStatus(ticket.slaDeadline, ticket.status);
                  return (
                    <tr key={ticket.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="font-orbitron text-xs text-accent hover:underline whitespace-nowrap"
                        >
                          {ticket.ticketId}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-white font-helvetica">{ticket.client.name}</p>
                        <p className="text-xs text-white/30 font-helvetica">{ticket.client.contact}</p>
                      </td>
                      <td className="px-5 py-3.5 max-w-[200px]">
                        <Link href={`/dashboard/tickets/${ticket.id}`} className="text-sm text-white/80 font-helvetica hover:text-white line-clamp-2">
                          {ticket.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PRIORITY_STYLES[ticket.priority])}>
                          {PRIORITY_LABELS[ticket.priority]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", STATUS_STYLES[ticket.status])}>
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica whitespace-nowrap">
                        {ticket.assignedName}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica whitespace-nowrap", SLA_STATUS_STYLES[sla])}>
                          {formatTimeLeft(ticket.slaDeadline)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica whitespace-nowrap">
                        {formatDateTime(ticket.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
}
function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
