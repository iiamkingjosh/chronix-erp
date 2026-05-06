"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getClients } from "@/lib/crm-service";
import { formatCrmDateTime } from "@/types/crm";
import type { Client } from "@/types/crm";
import { cn } from "@/lib/utils";
import { formatNaira } from "@/types/finance";

export default function ClientsPage() {
  const [clients, setClients]   = useState<Client[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");

  useEffect(() => {
    getClients().then(setClients).finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-white">{clients.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total Clients</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-emerald-400">
            {clients.filter((c) => c.subscriptions.some((s) => s.status === "active")).length}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Active Subscriptions</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-secondary">
            {formatNaira(
              clients.reduce(
                (s, c) => s + c.subscriptions.filter((sub) => sub.status === "active").reduce((ss, sub) => ss + sub.monthlyValue, 0),
                0
              )
            )}
          </p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Monthly Recurring</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="input-field pl-10"
        />
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {clients.length === 0 ? "No clients yet. Convert a lead to get started." : "No clients match your search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Client</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Contact</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Subscriptions</th>
                  <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Monthly Value</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned To</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((client) => {
                  const activeSubs = client.subscriptions.filter((s) => s.status === "active");
                  const mrr = activeSubs.reduce((s, sub) => s + sub.monthlyValue, 0);
                  return (
                    <tr key={client.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/crm/clients/${client.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                          {client.fullName}
                        </Link>
                        {client.company && <p className="text-xs text-white/30 font-helvetica">{client.company}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-white/60 font-helvetica">{client.email}</p>
                        <p className="text-xs text-white/30 font-helvetica">{client.phone}</p>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {activeSubs.length > 0 ? (
                          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-helvetica">
                            {activeSubs.length} active
                          </span>
                        ) : (
                          <span className="text-xs text-white/20 font-helvetica">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white font-semibold font-helvetica text-right">
                        {mrr > 0 ? formatNaira(mrr) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{client.assignedName}</td>
                      <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica">{formatCrmDateTime(client.createdAt)}</td>
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
