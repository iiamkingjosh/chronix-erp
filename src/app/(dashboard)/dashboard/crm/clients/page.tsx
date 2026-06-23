"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getClients } from "@/lib/crm-service";
import { formatCrmDateTime } from "@/types/crm";
import type { Client } from "@/types/crm";

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
      <div className="surface-card p-5 text-center max-w-xs mb-6">
        <p className="font-orbitron text-2xl font-bold text-white">{clients.length}</p>
        <p className="text-white/30 text-xs font-helvetica mt-1">Total Clients</p>
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
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned To</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((client) => (
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
                    <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{client.assignedName}</td>
                    <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica">{formatCrmDateTime(client.createdAt)}</td>
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

function SearchIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
}
