"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ROLE_COLORS } from "@/types/roles";
import type { ChronixUser } from "@/types/roles";
import { cn } from "@/lib/utils";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function StaffPage() {
  const [users, setUsers]     = useState<ChronixUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    getDocs(collection(db, "users"))
      .then((snap) => setUsers(snap.docs.map((d) => d.data() as ChronixUser)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.displayName ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <ProtectedRoute requiredPermission="manage:staff">
      <div className="p-8 max-w-5xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-orbitron text-2xl font-bold text-white">Staff</h1>
            <p className="text-white/40 text-sm font-helvetica mt-1">All platform user accounts and their roles</p>
          </div>
          <Link href="/setup/create-user" className="btn-primary text-xs px-4 py-2.5">
            + Add User
          </Link>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or role…"
            className="input-field max-w-md"
          />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {["CEO", "System Admin", "Staff", "Client"].map((role) => {
            const count = users.filter((u) => u.role === role).length;
            return (
              <div key={role} className="surface-card p-4 text-center">
                <p className="font-orbitron text-xl font-bold text-white">{count}</p>
                <p className="text-white/30 text-xs font-helvetica mt-1">{role}</p>
              </div>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-white/20 text-sm font-helvetica">
                  {users.length === 0 ? "No users yet. Create the first account above." : "No users match search."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      {["Name", "Email", "Role", "Joined"].map((h) => (
                        <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((u) => (
                      <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-xs font-bold text-white font-orbitron shrink-0">
                              {(u.displayName ?? u.email)[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-semibold text-white font-helvetica">
                              {u.displayName ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{u.email}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                            ROLE_COLORS[u.role as keyof typeof ROLE_COLORS] ?? "bg-white/10 text-white/50 border-white/20"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-white/20 font-helvetica">
          To change a user&apos;s role, update their <code className="text-accent/60">role</code> field directly in Firestore → users collection.
        </p>
      </div>
    </ProtectedRoute>
  );
}
