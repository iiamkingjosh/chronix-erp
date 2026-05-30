"use client";

import { useEffect, useState } from "react";
import { getCampaigns, createCampaign, updateCampaignStatus } from "@/lib/brand-service";
import { PLATFORM_LABELS, CAMPAIGN_STATUS_STYLES } from "@/types/brand";
import type { Campaign, Platform, CampaignStatus } from "@/types/brand";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const today = new Date().toISOString().split("T")[0];

export default function CampaignsPage() {
  const { profile }                 = useAuth();
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({
    name: "", objective: "", startDate: today, endDate: "",
    budget: "", targetAudience: "", channels: [] as Platform[], notes: "",
  });
  const [saving, setSaving]         = useState(false);

  useEffect(() => { getCampaigns().then(setCampaigns).finally(() => setLoading(false)); }, []);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }
  function toggleChannel(ch: Platform) {
    setForm((p) => ({ ...p, channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch] }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.name) return;
    setSaving(true);
    const c = await createCampaign({
      name:           form.name,
      objective:      form.objective,
      status:         "draft",
      startDate:      form.startDate,
      endDate:        form.endDate || undefined,
      budget:         form.budget ? Number(form.budget) : undefined,
      targetAudience: form.targetAudience || undefined,
      channels:       form.channels,
      notes:          form.notes || undefined,
      createdBy:      profile.displayName ?? profile.email,
      createdAt:      new Date().toISOString(),
    });
    setCampaigns((prev) => [c, ...prev]);
    setShowForm(false);
    setForm({ name: "", objective: "", startDate: today, endDate: "", budget: "", targetAudience: "", channels: [], notes: "" });
    setSaving(false);
  }

  async function handleStatus(id: string, status: CampaignStatus) {
    await updateCampaignStatus(id, status);
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Campaign Management</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Lead gen, brand awareness and product campaigns</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ New Campaign</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total",     value: campaigns.length,                                 color: "text-white" },
          { label: "Active",    value: campaigns.filter((c) => c.status === "active").length,     color: "text-emerald-400" },
          { label: "Completed", value: campaigns.filter((c) => c.status === "completed").length,  color: "text-blue-400" },
          { label: "Total Budget", value: formatNaira(campaigns.reduce((s, c) => s + (c.budget ?? 0), 0)), color: "text-secondary", isText: true },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn(s.isText ? "font-orbitron text-sm font-bold" : "font-orbitron text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="surface-card p-6 mb-6 border border-accent/20 space-y-4 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">New Campaign</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Campaign Name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Campaign name" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Objective</label>
              <input value={form.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Lead gen, brand awareness…" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="field-label">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="field-label">Budget (₦)</label>
              <input type="number" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="0" className="input-field" />
            </div>
            <div>
              <label className="field-label">Target Audience</label>
              <input value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder="SMBs in Lagos…" className="input-field" />
            </div>
          </div>
          <div>
            <label className="field-label">Channels</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((ch) => (
                <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                  className={cn("text-xs px-3 py-1.5 rounded-lg border font-helvetica transition-colors",
                    form.channels.includes(ch) ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
                  )}>
                  {PLATFORM_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Create Campaign"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="surface-card px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No campaigns yet.</p></div>
          ) : campaigns.map((camp) => (
            <div key={camp.id} className="surface-card px-5 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-white font-helvetica">{camp.name}</p>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", CAMPAIGN_STATUS_STYLES[camp.status])}>{camp.status}</span>
                  </div>
                  <p className="text-xs text-white/50 font-helvetica">{camp.objective}</p>
                  <div className="flex gap-4 mt-1 flex-wrap text-[10px] text-white/25 font-helvetica">
                    <span>{camp.startDate}{camp.endDate ? ` → ${camp.endDate}` : ""}</span>
                    {camp.budget && <span>{formatNaira(camp.budget)}</span>}
                    {camp.channels.length > 0 && <span>{camp.channels.map((c) => PLATFORM_LABELS[c]).join(" · ")}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {camp.status === "draft"    && <button onClick={() => handleStatus(camp.id, "active")}    className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica">Launch</button>}
                  {camp.status === "active"   && <button onClick={() => handleStatus(camp.id, "paused")}    className="text-xs text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg font-helvetica">Pause</button>}
                  {camp.status === "paused"   && <button onClick={() => handleStatus(camp.id, "active")}    className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg font-helvetica">Resume</button>}
                  {(camp.status === "active" || camp.status === "paused") && (
                    <button onClick={() => handleStatus(camp.id, "completed")} className="text-xs text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg font-helvetica">Complete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
