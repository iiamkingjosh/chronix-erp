"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ROLES,
  ROLE_COLORS,
  hasPermission,
  isRootAdmin,
  resolveRole,
  type ChronixUser,
  type Role,
} from "@/types/roles";
import { cn } from "@/lib/utils";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

function rootLikeRoleStr(r: string): boolean {
  return r === "Root Admin" || r === "Chronix Root" || r === "Root";
}

/** Roles an editor may assign (HR cannot assign Root Admin). */
function rolesAssignableByCaller(rawRole: string): Role[] {
  const internal = Object.values(ROLES).filter((r) => r !== ROLES.CLIENT);
  if (isRootAdmin(rawRole)) return internal;
  return internal.filter((r) => r !== ROLES.ROOT_ADMIN);
}

export default function StaffPage() {
  const { profile } = useAuth();
  const [users, setUsers]     = useState<ChronixUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [draftRoles, setDraftRoles] = useState<Partial<Record<string, Role>>>({});
  const [savingUid, setSavingUid]     = useState<string | null>(null);
  const [saveError, setSaveError]   = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    setLoading(true);
    getDocs(collection(db, "users"))
      .then((snap) =>
        setUsers(
          snap.docs.map((d) => {
            const data = d.data() as ChronixUser;
            return {
              ...data,
              uid:  d.id,
              role: resolveRole(data.role ?? ""),
            };
          }),
        ),
      )
      .catch((e) => console.error("Failed to load staff:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const canManageDirectory =
    !!profile &&
    (hasPermission(profile.role, "manage:staff") ||
      hasPermission(profile.role, "manage:hr") ||
      isRootAdmin(profile.role));

  const editorMayManageRootRoles =
    !!profile && (hasPermission(profile.role, "manage:staff") || isRootAdmin(profile.role));

  const assignableRoles = profile ? rolesAssignableByCaller(profile.role) : [];

  function canEditRow(u: ChronixUser): boolean {
    if (!profile || !canManageDirectory) return false;
    if (u.uid === profile.uid) return false;
    if (rootLikeRoleStr(u.role) && !editorMayManageRootRoles) return false;
    return true;
  }

  function effectiveRole(u: ChronixUser): Role {
    return draftRoles[u.uid] ?? u.role;
  }

  function roleDirty(u: ChronixUser): boolean {
    return effectiveRole(u) !== u.role;
  }

  async function saveRole(uid: string) {
    if (!profile) return;
    const row = users.find((x) => x.uid === uid);
    if (!row) return;
    const next = effectiveRole(row);
    if (next === row.role) return;
    if (!assignableRoles.includes(next)) {
      setSaveError("You cannot assign that role.");
      return;
    }
    setSaveError(null);
    setSavingUid(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: next });
      setDraftRoles((d) => {
        const copy = { ...d };
        delete copy[uid];
        return copy;
      });
      await loadUsers();
    } catch {
      setSaveError("Could not update role. Check Firestore rules and your permissions.");
    } finally {
      setSavingUid(null);
    }
  }

  const filtered = useMemo(() => users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.displayName ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }), [users, search]);

  return (
    <ProtectedRoute requiredAnyPermission={["manage:staff", "manage:hr"]}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-orbitron text-2xl font-bold text-white">Staff</h1>
            <p className="text-white/40 text-sm font-helvetica mt-1">
              Platform accounts — Root Admin, System Admin, and HR can invite users; HR and staff admins can fix roles here (Root-like roles: System Admin / Root Admin only).
            </p>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or role…"
            className="input-field max-w-md"
          />
        </div>

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

        {saveError && (
          <div className="mb-4 text-sm text-red-400 font-helvetica bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {saveError}
          </div>
        )}

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
                      {["Name", "Email", "Role", "Joined", ""].map((h) => (
                        <th
                          key={h || "actions"}
                          className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica"
                        >
                          {h}
                        </th>
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
                          {canEditRow(u) ? (
                            <select
                              value={effectiveRole(u)}
                              onChange={(e) =>
                                setDraftRoles((prev) => ({
                                  ...prev,
                                  [u.uid]: e.target.value as Role,
                                }))
                              }
                              className="input-field text-xs py-2 max-w-[200px]"
                            >
                              {assignableRoles.map((r) => (
                                <option key={r} value={r} className="bg-primary-dark">
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica inline-block",
                                ROLE_COLORS[u.role as keyof typeof ROLE_COLORS] ??
                                  "bg-white/10 text-white/50 border-white/20",
                              )}
                            >
                              {u.role}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-white/30 font-helvetica">
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canEditRow(u) && roleDirty(u) && (
                            <button
                              type="button"
                              disabled={savingUid === u.uid}
                              onClick={() => saveRole(u.uid)}
                              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50 font-helvetica"
                            >
                              {savingUid === u.uid ? "Saving…" : "Save role"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
