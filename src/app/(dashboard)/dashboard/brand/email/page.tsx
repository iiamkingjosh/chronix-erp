"use client";

import { useEffect, useState } from "react";
import { getEmailCampaigns, createEmailCampaign, updateEmailCampaignStatus } from "@/lib/brand-service";
import { getClients } from "@/lib/crm-service";
import { getLeads } from "@/lib/crm-service";
import type { EmailCampaign } from "@/types/brand";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<EmailCampaign["status"], string> = {
  draft:     "bg-white/8 text-white/40 border-white/15",
  scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  sent:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-white/8 text-white/25 border-white/10",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EmailMarketingPage() {
  const { profile }                         = useAuth();
  const [campaigns, setCampaigns]           = useState<EmailCampaign[]>([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [sending, setSending]               = useState<string | null>(null);
  const [form, setForm]                     = useState({
    subject: "", preheader: "", targetSegment: "all_clients" as EmailCampaign["targetSegment"],
    customEmails: "", htmlContent: "",
  });
  const [saving, setSaving]                 = useState(false);

  useEffect(() => { getEmailCampaigns().then(setCampaigns).finally(() => setLoading(false)); }, []);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.subject || !form.htmlContent) return;
    setSaving(true);
    const c = await createEmailCampaign({
      subject:       form.subject,
      preheader:     form.preheader || undefined,
      targetSegment: form.targetSegment,
      customEmails:  form.customEmails || undefined,
      htmlContent:   form.htmlContent,
      status:        "draft",
      createdBy:     profile.displayName ?? profile.email,
      createdAt:     new Date().toISOString(),
    });
    setCampaigns((prev) => [c, ...prev]);
    setShowForm(false);
    setForm({ subject: "", preheader: "", targetSegment: "all_clients", customEmails: "", htmlContent: "" });
    setSaving(false);
  }

  async function handleSend(camp: EmailCampaign) {
    if (!profile) return;
    setSending(camp.id);
    try {
      /* Resolve recipients */
      let emails: string[] = [];
      if (camp.targetSegment === "all_clients") {
        const clients = await getClients();
        emails = clients.map((c) => c.email).filter(Boolean);
      } else if (camp.targetSegment === "all_leads") {
        const leads = await getLeads();
        emails = leads.map((l) => l.email).filter(Boolean);
      } else if (camp.targetSegment === "custom" && camp.customEmails) {
        emails = camp.customEmails.split(",").map((e) => e.trim()).filter(Boolean);
      }

      if (emails.length === 0) { setSending(null); return; }

      const idToken = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      await fetch("/api/notifications/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          type: "renewal_due",
          title: camp.subject,
          message: camp.preheader ?? camp.subject,
          link: "/dashboard",
          targetRoles: ["CEO", "CFO"],
          sendEmail: true,
          sendPush: false,
          customEmails: emails,
          htmlOverride: camp.htmlContent,
        }),
      });

      await updateEmailCampaignStatus(camp.id, "sent", { sentAt: new Date().toISOString(), sentCount: emails.length });
      setCampaigns((prev) => prev.map((c) => c.id === camp.id ? { ...c, status: "sent", sentCount: emails.length } : c));
    } finally { setSending(null); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Email Marketing</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Send newsletters and campaigns to clients and leads</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ New Email Campaign</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total",  value: campaigns.length },
          { label: "Sent",   value: campaigns.filter((c) => c.status === "sent").length },
          { label: "Drafts", value: campaigns.filter((c) => c.status === "draft").length },
          { label: "Emails Sent", value: campaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0) },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className="font-orbitron text-2xl font-bold text-white">{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="surface-card p-6 mb-6 border border-accent/20 space-y-4 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">New Email Campaign</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Subject Line</label>
              <input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Email subject" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Preheader Text</label>
              <input value={form.preheader} onChange={(e) => set("preheader", e.target.value)} placeholder="Preview text shown in inbox" className="input-field" />
            </div>
            <div>
              <label className="field-label">Target Segment</label>
              <select value={form.targetSegment} onChange={(e) => set("targetSegment", e.target.value)} className="input-field">
                <option value="all_clients" className="bg-primary-dark">All Clients</option>
                <option value="all_leads"   className="bg-primary-dark">All Leads</option>
                <option value="custom"      className="bg-primary-dark">Custom List</option>
              </select>
            </div>
            {form.targetSegment === "custom" && (
              <div>
                <label className="field-label">Email Addresses (comma-separated)</label>
                <input value={form.customEmails} onChange={(e) => set("customEmails", e.target.value)} placeholder="a@example.com, b@example.com" className="input-field" />
              </div>
            )}
          </div>
          <div>
            <label className="field-label">HTML Content</label>
            <textarea value={form.htmlContent} onChange={(e) => set("htmlContent", e.target.value)} rows={10} className="input-field resize-y font-mono text-xs" placeholder="Paste your full HTML email body here…" required />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Save as Draft"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden divide-y divide-white/5">
          {campaigns.length === 0 ? (
            <div className="px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No email campaigns yet.</p></div>
          ) : campaigns.map((camp) => (
            <div key={camp.id} className="flex items-center gap-4 px-5 py-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-white font-helvetica">{camp.subject}</p>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", STATUS_STYLES[camp.status])}>{camp.status}</span>
                </div>
                <div className="text-[10px] text-white/25 font-helvetica flex gap-3 flex-wrap">
                  <span>{camp.targetSegment.replace("_", " ")}</span>
                  {camp.sentAt && <span>Sent {fmtDate(camp.sentAt)}</span>}
                  {camp.sentCount != null && <span>{camp.sentCount} recipients</span>}
                  <span>By {camp.createdBy}</span>
                </div>
              </div>
              {camp.status === "draft" && (
                <button onClick={() => handleSend(camp)} disabled={sending === camp.id}
                  className="text-xs text-accent border border-accent/25 hover:bg-accent/10 px-4 py-2 rounded-xl font-helvetica transition-colors disabled:opacity-40 shrink-0">
                  {sending === camp.id ? "Sending…" : "Send Now"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
