"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { createAsset } from "@/lib/asset-service";
import { getEmployees } from "@/lib/hr-service";
import { ASSET_CATEGORY_LABELS } from "@/types/asset";
import type { AssetCategory, AssetCondition } from "@/types/asset";
import type { Employee } from "@/types/hr";
import { formatNaira } from "@/types/finance";

const CATEGORIES = Object.entries(ASSET_CATEGORY_LABELS) as [AssetCategory, string][];

export default function NewAssetPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    name: "", category: "laptop" as AssetCategory, brand: "",
    model: "", serialNumber: "", purchaseDate: "",
    purchaseCost: "", warrantyExpiry: "", condition: "good" as AssetCondition,
    location: "", assignedToUid: "", clientName: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => { getEmployees().then(setEmployees); }, []);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.name.trim()) return;
    setSaving(true); setError(null);
    const assignedEmp = form.assignedToUid ? employees.find((em) => em.uid === form.assignedToUid) : null;
    try {
      await createAsset({
        name:           form.name,
        category:       form.category,
        brand:          form.brand || undefined,
        model:          form.model || undefined,
        serialNumber:   form.serialNumber || undefined,
        purchaseDate:   form.purchaseDate || undefined,
        purchaseCost:   form.purchaseCost ? Number(form.purchaseCost) : undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        condition:      form.condition,
        location:       form.location || undefined,
        status:         assignedEmp ? "assigned" : "available",
        assignedTo:     assignedEmp?.fullName,
        assignedToUid:  assignedEmp?.uid,
        assignedAt:     assignedEmp ? new Date().toISOString() : undefined,
        clientName:     form.clientName || undefined,
        notes:          form.notes || undefined,
        assignmentHistory: assignedEmp ? [{ employeeUid: assignedEmp.uid, employeeName: assignedEmp.fullName, assignedAt: new Date().toISOString() }] : [],
        createdAt:      new Date().toISOString(),
        createdBy:      profile.displayName ?? profile.email,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "assets", entityRef: form.name, details: `Asset registered: ${form.name} (${form.category})${assignedEmp ? ` assigned to ${assignedEmp.fullName}` : ""}`, timestamp: new Date().toISOString() });
      router.push("/dashboard/assets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">Add Asset</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Register new device or equipment</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Asset Name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. MacBook Pro 2023" className="input-field" required />
          </div>
          <div>
            <label className="field-label">Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="input-field">
              {CATEGORIES.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Brand</label>
            <input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Apple, HP, Cisco…" className="input-field" />
          </div>
          <div>
            <label className="field-label">Model</label>
            <input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Model number" className="input-field" />
          </div>
          <div>
            <label className="field-label">Serial Number</label>
            <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} placeholder="S/N" className="input-field" />
          </div>
          <div>
            <label className="field-label">Condition</label>
            <select value={form.condition} onChange={(e) => set("condition", e.target.value)} className="input-field">
              {["excellent","good","fair","poor"].map((c) => <option key={c} value={c} className="bg-primary-dark capitalize">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Purchase Date</label>
            <input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">Purchase Cost (₦)</label>
            <input type="number" min="0" value={form.purchaseCost} onChange={(e) => set("purchaseCost", e.target.value)} placeholder="0" className="input-field" />
          </div>
          <div>
            <label className="field-label">Warranty Expiry</label>
            <input type="date" value={form.warrantyExpiry} onChange={(e) => set("warrantyExpiry", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="field-label">Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Office, Lagos HQ…" className="input-field" />
          </div>
        </div>
        <div>
          <label className="field-label">Assign To (optional)</label>
          <select value={form.assignedToUid} onChange={(e) => set("assignedToUid", e.target.value)} className="input-field">
            <option value="" className="bg-primary-dark">Unassigned</option>
            {employees.map((emp) => <option key={emp.uid} value={emp.uid} className="bg-primary-dark">{emp.fullName} — {emp.department}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Client (optional)</label>
          <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Client this asset is deployed at" className="input-field" />
        </div>
        <div>
          <label className="field-label">Notes</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input-field resize-none" placeholder="Any additional info…" />
        </div>
        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Saving…" : "Add Asset"}</button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  );
}
