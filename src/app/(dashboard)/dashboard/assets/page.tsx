"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAssets, updateAssetStatus, returnAsset } from "@/lib/asset-service";
import { ASSET_CATEGORY_LABELS, ASSET_STATUS_STYLES, ASSET_CONDITION_STYLES } from "@/types/asset";
import type { Asset, AssetStatus } from "@/types/asset";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

type Filter = "all" | AssetStatus;

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function warrantyBadge(expiry?: string) {
  if (!expiry) return null;
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0)  return <span className="text-[10px] text-red-400 font-helvetica">Expired</span>;
  if (days < 30) return <span className="text-[10px] text-amber-400 font-helvetica">{days}d left</span>;
  return null;
}

export default function AssetsPage() {
  const { profile }           = useAuth();
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>("all");
  const [search, setSearch]   = useState("");
  const [acting, setActing]   = useState<string | null>(null);

  // Matches firestore.rules' assets create/update rule exactly:
  // isSystemAdmin() || isCEO() || canManageHR() || isITManager().
  // manage:assets covers Root Admin (wildcard), System Admin, HR, and
  // IT Manager; CEO is checked separately since CEO's role is deliberately
  // kept out of manage:* permissions everywhere else (see roles.ts) - this
  // is a rule-driven exception for assets specifically, not a permission.
  const canManage = profile
    ? hasPermission(profile.role, "manage:assets") || profile.role === "CEO"
    : false;

  useEffect(() => { getAssets().then(setAssets).finally(() => setLoading(false)); }, []);

  const filtered = assets
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.serialNumber ?? "").toLowerCase().includes(search.toLowerCase()) || (a.assignedTo ?? "").toLowerCase().includes(search.toLowerCase()));

  const stats = {
    total:      assets.length,
    assigned:   assets.filter((a) => a.status === "assigned").length,
    available:  assets.filter((a) => a.status === "available").length,
    inRepair:   assets.filter((a) => a.status === "in_repair").length,
    totalValue: assets.reduce((s, a) => s + (a.purchaseCost ?? 0), 0),
  };

  async function handleReturn(id: string) {
    setActing(id);
    await returnAsset(id);
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, status: "available" as AssetStatus, assignedTo: undefined, assignedToUid: undefined } : a));
    setActing(null);
  }

  async function handleDecommission(id: string) {
    setActing(id);
    await updateAssetStatus(id, "decommissioned");
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, status: "decommissioned" as AssetStatus } : a));
    setActing(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Asset &amp; Device Management</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Hardware, software and equipment inventory</p>
        </div>
        {canManage && <Link href="/dashboard/assets/new" className="btn-primary text-xs px-4 py-2.5">+ Add Asset</Link>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Assets",    value: stats.total,    color: "text-white" },
          { label: "Assigned",        value: stats.assigned,  color: "text-blue-400" },
          { label: "Available",       value: stats.available, color: "text-emerald-400" },
          { label: "In Repair",       value: stats.inRepair,  color: "text-amber-400" },
          { label: "Total Value",     value: formatNaira(stats.totalValue), color: "text-secondary", isText: true },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn(s.isText ? "font-orbitron text-sm font-bold" : "font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, serial, assignee…" className="input-field flex-1 min-w-[200px]" />
        <div className="flex gap-2 flex-wrap">
          {(["all", "available", "assigned", "in_repair", "decommissioned"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
                filter === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
              )}>
              {f === "all" ? "All" : f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No assets found.</p>
              {canManage && <Link href="/dashboard/assets/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">Add first asset →</Link>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Asset</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Category</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Assigned To</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                    <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Condition</th>
                    <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Warranty</th>
                    <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((asset) => (
                    <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/assets/${asset.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">{asset.name}</Link>
                        {asset.serialNumber && <p className="text-xs text-white/30 font-helvetica">S/N: {asset.serialNumber}</p>}
                        {asset.brand && <p className="text-xs text-white/20 font-helvetica">{asset.brand} {asset.model}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/50 font-helvetica">{ASSET_CATEGORY_LABELS[asset.category]}</td>
                      <td className="px-5 py-3.5 text-sm text-white/70 font-helvetica">
                        {asset.assignedTo ?? <span className="text-white/20">—</span>}
                        {asset.clientName && <p className="text-xs text-white/30 font-helvetica">{asset.clientName}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", ASSET_STATUS_STYLES[asset.status])}>
                          {asset.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn("text-xs font-helvetica capitalize", ASSET_CONDITION_STYLES[asset.condition])}>{asset.condition}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica">
                        {fmtDate(asset.warrantyExpiry)}
                        {warrantyBadge(asset.warrantyExpiry)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/dashboard/assets/${asset.id}`} className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors">View</Link>
                          {canManage && asset.status === "assigned" && (
                            <button onClick={() => handleReturn(asset.id)} disabled={acting === asset.id}
                              className="text-xs text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                              {acting === asset.id ? "…" : "Return"}
                            </button>
                          )}
                          {canManage && asset.status !== "decommissioned" && (
                            <button onClick={() => handleDecommission(asset.id)} disabled={acting === asset.id}
                              className="text-xs text-white/30 border border-white/10 hover:bg-white/5 px-2.5 py-1 rounded-lg font-helvetica transition-colors disabled:opacity-40">
                              Decommission
                            </button>
                          )}
                        </div>
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
  );
}
