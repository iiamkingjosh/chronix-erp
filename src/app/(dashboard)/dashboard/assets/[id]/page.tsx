"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAsset, assignAsset, returnAsset, updateAsset } from "@/lib/asset-service";
import { getEmployees } from "@/lib/hr-service";
import { ASSET_CATEGORY_LABELS, ASSET_STATUS_STYLES, ASSET_CONDITION_STYLES } from "@/types/asset";
import type { Asset } from "@/types/asset";
import type { Employee } from "@/types/hr";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AssetDetailPage() {
  const { id }              = useParams() as { id: string };
  const router              = useRouter();
  const { profile }         = useAuth();
  const [asset, setAsset]   = useState<Asset | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignUid, setAssignUid] = useState("");
  const [acting, setActing] = useState(false);

  const canManage = profile
    ? isRootAdmin(profile.role) ||
      hasPermission(profile.role, "manage:hr") ||
      profile.role === "System Admin" ||
      profile.role === "CEO"
    : false;

  useEffect(() => {
    Promise.all([getAsset(id), getEmployees()])
      .then(([a, emps]) => { setAsset(a); setEmployees(emps); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAssign() {
    if (!asset || !assignUid) return;
    const emp = employees.find((e) => e.uid === assignUid);
    if (!emp) return;
    setActing(true);
    await assignAsset(asset.id, emp.uid, emp.fullName);
    setAsset((prev) => prev ? { ...prev, status: "assigned", assignedTo: emp.fullName, assignedToUid: emp.uid } : prev);
    setActing(false); setAssignUid("");
  }

  async function handleReturn() {
    if (!asset) return;
    setActing(true);
    await returnAsset(asset.id);
    setAsset((prev) => prev ? { ...prev, status: "available", assignedTo: undefined, assignedToUid: undefined } : prev);
    setActing(false);
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  if (!asset)  return <div className="p-8 text-white/40 font-helvetica">Asset not found. <button onClick={() => router.back()} className="text-accent hover:underline">Go back</button></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">{asset.name}</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">{ASSET_CATEGORY_LABELS[asset.category]}</p>
        </div>
        <span className={cn("ml-auto text-[10px] font-semibold px-3 py-1 rounded-full border font-helvetica", ASSET_STATUS_STYLES[asset.status])}>
          {asset.status.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Details */}
        <div className="lg:col-span-2 space-y-5">
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Asset Details</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm font-helvetica">
              {[
                ["Brand", asset.brand],
                ["Model", asset.model],
                ["Serial Number", asset.serialNumber],
                ["Condition", asset.condition],
                ["Location", asset.location],
                ["Purchase Date", fmtDate(asset.purchaseDate?.split("T")[0])],
                ["Purchase Cost", asset.purchaseCost != null ? formatNaira(asset.purchaseCost) : null],
                ["Warranty Expiry", fmtDate(asset.warrantyExpiry?.split("T")[0])],
                ["Client", asset.clientName],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">{k}</dt>
                  <dd className={cn("text-white", k === "Condition" && ASSET_CONDITION_STYLES[asset.condition])}>{v}</dd>
                </div>
              ))}
            </dl>
            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-helvetica mb-1">Notes</p>
                <p className="text-sm text-white/60 font-helvetica">{asset.notes}</p>
              </div>
            )}
          </div>

          {/* Assignment history */}
          <div className="surface-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest">Assignment History</h3>
            </div>
            {!asset.assignmentHistory?.length ? (
              <div className="px-5 py-8 text-center"><p className="text-white/20 text-sm font-helvetica">Never assigned.</p></div>
            ) : (
              <div className="divide-y divide-white/5">
                {[...asset.assignmentHistory].reverse().map((h, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white font-helvetica">{h.employeeName}</p>
                      <p className="text-xs text-white/30 font-helvetica">Assigned {fmtDate(h.assignedAt)}</p>
                    </div>
                    {h.returnedAt ? (
                      <span className="text-xs text-white/30 font-helvetica">Returned {fmtDate(h.returnedAt)}</span>
                    ) : (
                      <span className="text-[10px] text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-helvetica">Current</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="space-y-4">
            {asset.status === "available" && (
              <div className="surface-card p-5">
                <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Assign Asset</h3>
                <select value={assignUid} onChange={(e) => setAssignUid(e.target.value)} className="input-field mb-3">
                  <option value="" className="bg-primary-dark">Select employee…</option>
                  {employees.map((emp) => <option key={emp.uid} value={emp.uid} className="bg-primary-dark">{emp.fullName}</option>)}
                </select>
                <button onClick={handleAssign} disabled={!assignUid || acting} className="btn-primary w-full text-xs">
                  {acting ? "Assigning…" : "Assign"}
                </button>
              </div>
            )}
            {asset.status === "assigned" && (
              <div className="surface-card p-5">
                <p className="text-sm text-white/60 font-helvetica mb-3">Currently assigned to <strong className="text-white">{asset.assignedTo}</strong></p>
                <button onClick={handleReturn} disabled={acting} className="w-full text-xs text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 py-2.5 rounded-xl font-helvetica transition-colors">
                  {acting ? "Processing…" : "Mark as Returned"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
