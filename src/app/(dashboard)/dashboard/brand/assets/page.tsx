"use client";

import { useEffect, useState } from "react";
import { getBrandAssets, createBrandAsset, deleteBrandAsset } from "@/lib/brand-service";
import type { BrandAsset, AssetFileType } from "@/types/brand";
import { useAuth } from "@/contexts/AuthContext";
import { isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

const FILE_ICONS: Record<AssetFileType, string> = { image: "🖼️", video: "🎬", document: "📄", font: "🔤", other: "📎" };

export default function BrandAssetsPage() {
  const { profile }             = useAuth();
  const [assets, setAssets]     = useState<BrandAsset[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: "", fileType: "image" as AssetFileType, url: "", description: "", tags: "", version: "1.0" });
  const [saving, setSaving]     = useState(false);

  const canManage = !!profile && (
    isRootAdmin(profile.role) ||
    profile.role === "Brand Lead" ||
    profile.role === "System Admin" ||
    profile.role === "CEO"
  );

  useEffect(() => { getBrandAssets().then(setAssets).finally(() => setLoading(false)); }, []);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.name || !form.url) return;
    setSaving(true);
    const asset = await createBrandAsset({
      name: form.name, fileType: form.fileType, url: form.url,
      description: form.description || undefined,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      version: form.version,
      uploadedBy: profile.displayName ?? profile.email,
      createdAt: new Date().toISOString(),
    });
    setAssets((prev) => [asset, ...prev]);
    setShowForm(false);
    setForm({ name: "", fileType: "image", url: "", description: "", tags: "", version: "1.0" });
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await deleteBrandAsset(id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Brand Asset Library</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Logos, templates, fonts and brand materials</p>
        </div>
        {canManage && <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ Add Asset</button>}
      </div>

      {showForm && canManage && (
        <form onSubmit={handleAdd} className="surface-card p-6 mb-6 border border-accent/20 space-y-4 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Register Brand Asset</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Asset Name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Primary Logo SVG" className="input-field" required />
            </div>
            <div>
              <label className="field-label">File Type</label>
              <select value={form.fileType} onChange={(e) => set("fileType", e.target.value)} className="input-field">
                {(["image","video","document","font","other"] as AssetFileType[]).map((t) => <option key={t} value={t} className="bg-primary-dark capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Version</label>
              <input value={form.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0" className="input-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">URL / Link</label>
              <input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://drive.google.com/… or public URL" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="logo, dark, svg" className="input-field" />
            </div>
            <div className="sm:col-span-3">
              <label className="field-label">Description</label>
              <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Usage guidelines, context…" className="input-field" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Add Asset"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.length === 0 ? (
            <div className="col-span-full surface-card px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No brand assets yet.</p></div>
          ) : assets.map((asset) => (
            <div key={asset.id} className="surface-card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{FILE_ICONS[asset.fileType]}</span>
                  <div>
                    <p className="text-sm font-semibold text-white font-helvetica leading-tight">{asset.name}</p>
                    <p className="text-[10px] text-white/30 font-helvetica">v{asset.version} · {asset.uploadedBy}</p>
                  </div>
                </div>
                {canManage && <button onClick={() => handleDelete(asset.id)} className="text-white/20 hover:text-red-400 transition-colors text-xs">✕</button>}
              </div>
              {asset.description && <p className="text-xs text-white/50 font-helvetica">{asset.description}</p>}
              {asset.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {asset.tags.map((tag) => <span key={tag} className="text-[10px] bg-white/5 text-white/35 border border-white/10 px-1.5 py-0.5 rounded font-helvetica">{tag}</span>)}
                </div>
              )}
              <a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline font-helvetica mt-auto">Open / Download →</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
