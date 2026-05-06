"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getVendors, updateVendorStatus } from "@/lib/procurement-service";
import {
  VENDOR_CATEGORY_LABELS, VENDOR_CATEGORY_STYLES,
  VENDOR_STATUS_STYLES, renderStars, formatProcDateTime,
} from "@/types/procurement";
import type { Vendor, VendorStatus } from "@/types/procurement";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function VendorsPage() {
  const { profile } = useAuth();
  const [vendors, setVendors]   = useState<Vendor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState<"all" | VendorStatus>("all");

  const canManage = profile ? hasPermission(profile.role, "manage:procurement") : false;

  useEffect(() => {
    getVendors().then(setVendors).finally(() => setLoading(false));
  }, []);

  async function handleToggleStatus(vendor: Vendor) {
    const next: VendorStatus = vendor.status === "active" ? "inactive" : "active";
    await updateVendorStatus(vendor.id, next);
    setVendors((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, status: next } : v)));
  }

  const filtered = vendors.filter((v) => {
    if (filter !== "all" && v.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return v.companyName.toLowerCase().includes(q) || v.contactPerson.toLowerCase().includes(q);
    }
    return true;
  });

  const active   = vendors.filter((v) => v.status === "active").length;
  const inactive = vendors.filter((v) => v.status === "inactive").length;
  const avgRating = vendors.length
    ? (vendors.reduce((s, v) => s + (v.avgRating || 0), 0) / vendors.length).toFixed(1)
    : "—";

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-white">{vendors.length}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Total Vendors</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-emerald-400">{active}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Active</p>
        </div>
        <div className="surface-card p-5 text-center">
          <p className="font-orbitron text-2xl font-bold text-accent">{avgRating}</p>
          <p className="text-white/30 text-xs font-helvetica mt-1">Avg Rating</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…" className="input-field pl-10"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
                filter === f
                  ? f === "all" ? "bg-white/10 text-white border-white/20"
                    : f === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-white/8 text-white/40 border-white/15"
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {f === "all" ? `All (${vendors.length})` : f === "active" ? `Active (${active})` : `Inactive (${inactive})`}
            </button>
          ))}
        </div>
        {canManage && (
          <Link href="/dashboard/procurement/vendors/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> Add Vendor
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {vendors.length === 0 ? "No vendors yet." : "No vendors match filters."}
            </p>
            {canManage && vendors.length === 0 && (
              <Link href="/dashboard/procurement/vendors/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Add first vendor →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Vendor</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Category</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Contact</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                  <th className="px-5 py-4 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Rating</th>
                  <th className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Payment Terms</th>
                  <th className="px-5 py-4 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/procurement/vendors/${vendor.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                        {vendor.companyName}
                      </Link>
                      <p className="text-[10px] text-accent/60 font-orbitron">{vendor.vendorId}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", VENDOR_CATEGORY_STYLES[vendor.category])}>
                        {VENDOR_CATEGORY_LABELS[vendor.category]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-white/70 font-helvetica">{vendor.contactPerson}</p>
                      <p className="text-xs text-white/30 font-helvetica">{vendor.phone}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", VENDOR_STATUS_STYLES[vendor.status])}>
                        {vendor.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {vendor.avgRating > 0 ? (
                        <div>
                          <p className="text-accent text-sm">{renderStars(vendor.avgRating)}</p>
                          <p className="text-[10px] text-white/30 font-helvetica">{vendor.avgRating}/5 ({vendor.ratings.length})</p>
                        </div>
                      ) : (
                        <p className="text-white/20 text-xs font-helvetica">No ratings</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/50 font-helvetica">{vendor.paymentTerms || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/procurement/vendors/${vendor.id}`} className="text-xs text-white/40 hover:text-white font-helvetica px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
                          View
                        </Link>
                        {canManage && (
                          <button
                            onClick={() => handleToggleStatus(vendor)}
                            className={cn(
                              "text-xs font-helvetica px-2.5 py-1 rounded-lg border transition-colors",
                              vendor.status === "active"
                                ? "text-red-400 border-red-500/20 hover:bg-red-500/10"
                                : "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                            )}
                          >
                            {vendor.status === "active" ? "Deactivate" : "Activate"}
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
    </div>
  );
}

function SearchIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function PlusIcon()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
