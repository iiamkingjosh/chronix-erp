"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOpenTicketsWithSLA } from "@/lib/tickets-service";
import {
  PRIORITY_LABELS, PRIORITY_STYLES,
  STATUS_LABELS, STATUS_STYLES,
  getSlaStatus, SLA_STATUS_STYLES, formatTimeLeft, formatDateTime,
  SLA_HOURS,
} from "@/types/tickets";
import type { Ticket } from "@/types/tickets";
import { cn } from "@/lib/utils";

export default function SLADashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOpenTicketsWithSLA().then(setTickets).finally(() => setLoading(false));
  }, []);

  const active   = tickets;
  const resolved: Ticket[] = [];

  const breached   = active.filter((t) => getSlaStatus(t.slaDeadline, t.status) === "breached");
  const critical   = active.filter((t) => getSlaStatus(t.slaDeadline, t.status) === "critical");
  const warning    = active.filter((t) => getSlaStatus(t.slaDeadline, t.status) === "warning");
  const onTrack    = active.filter((t) => getSlaStatus(t.slaDeadline, t.status) === "ok");

  // Average resolution time (hours)
  const resolutionTimes = resolved
    .filter((t) => t.resolvedAt)
    .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000);
  const avgResolution = resolutionTimes.length
    ? resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length
    : 0;

  // SLA compliance rate
  const complianceRate =
    resolved.length === 0
      ? 100
      : Math.round(
          (resolved.filter((t) => {
            if (!t.resolvedAt) return false;
            return new Date(t.resolvedAt) <= new Date(t.slaDeadline);
          }).length /
            resolved.length) *
            100
        );

  // Sort active tickets by deadline (soonest first)
  const sortedActive = [...active].sort(
    (a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <SlaCard
          label="Breached SLA"
          value={breached.length}
          sub="need immediate action"
          valueClass="text-red-400"
          cardClass="border-red-500/20"
        />
        <SlaCard
          label="Critical (< 1h)"
          value={critical.length}
          sub="less than 1 hour left"
          valueClass="text-red-300"
          cardClass="border-red-500/10"
        />
        <SlaCard
          label="Warning (< 4h)"
          value={warning.length}
          sub="less than 4 hours left"
          valueClass="text-amber-400"
          cardClass="border-amber-500/15"
        />
        <SlaCard
          label="On Track"
          value={onTrack.length}
          sub="within deadline"
          valueClass="text-emerald-400"
          cardClass="border-emerald-500/15"
        />
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Avg Resolution Time</p>
          <p className="font-orbitron text-xl font-bold text-secondary">
            {avgResolution < 1
              ? `${Math.round(avgResolution * 60)}m`
              : `${avgResolution.toFixed(1)}h`}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">across {resolved.length} resolved tickets</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">SLA Compliance</p>
          <p className={cn("font-orbitron text-xl font-bold", complianceRate >= 90 ? "text-emerald-400" : complianceRate >= 70 ? "text-amber-400" : "text-red-400")}>
            {complianceRate}%
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">resolved within deadline</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">Active Tickets</p>
          <p className="font-orbitron text-xl font-bold text-white">{active.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">{resolved.length} resolved all time</p>
        </div>
      </div>

      {/* SLA targets reference */}
      <div className="surface-card p-5 mb-8">
        <p className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">SLA Targets by Priority</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["critical", "high", "medium", "low"] as const).map((p) => (
            <div key={p} className={cn("rounded-xl border px-4 py-3", PRIORITY_STYLES[p])}>
              <p className="font-orbitron text-xs font-bold capitalize">{PRIORITY_LABELS[p]}</p>
              <p className="font-helvetica text-lg font-bold mt-1">{SLA_HOURS[p]}h</p>
              <p className="font-helvetica text-[10px] opacity-70 mt-0.5">max response time</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active tickets table ordered by SLA urgency */}
      <div className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
            Active Tickets — SLA View
          </h2>
        </div>

        {sortedActive.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">No active tickets.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Ticket</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Priority</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Deadline</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">SLA Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedActive.map((ticket) => {
                  const sla = getSlaStatus(ticket.slaDeadline, ticket.status);
                  return (
                    <tr
                      key={ticket.id}
                      className={cn(
                        "hover:bg-white/[0.02] transition-colors",
                        sla === "breached" && "bg-red-500/[0.04]",
                        sla === "critical" && "bg-red-500/[0.02]",
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="font-orbitron text-xs text-accent hover:underline block"
                        >
                          {ticket.ticketId}
                        </Link>
                        <p className="text-xs text-white/40 font-helvetica mt-0.5 line-clamp-1">{ticket.title}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">{ticket.client.name}</td>
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
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{ticket.assignedName}</td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica whitespace-nowrap">
                        {formatDateTime(ticket.slaDeadline)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica whitespace-nowrap", SLA_STATUS_STYLES[sla])}>
                          {formatTimeLeft(ticket.slaDeadline)}
                        </span>
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

function SlaCard({
  label, value, sub, valueClass, cardClass,
}: {
  label: string; value: number; sub: string; valueClass: string; cardClass: string;
}) {
  return (
    <div className={cn("surface-card p-5 border", cardClass)}>
      <p className="text-white/40 text-xs uppercase tracking-wider font-helvetica mb-2">{label}</p>
      <p className={cn("font-orbitron text-3xl font-bold", valueClass)}>{value}</p>
      <p className="text-white/25 text-xs font-helvetica mt-1">{sub}</p>
    </div>
  );
}
