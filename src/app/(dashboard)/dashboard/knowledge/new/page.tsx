"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { createArticle } from "@/lib/knowledge-service";
import { KB_CATEGORY_LABELS } from "@/types/knowledge";
import type { KBCategory } from "@/types/knowledge";

const CATEGORIES = Object.entries(KB_CATEGORY_LABELS) as [KBCategory, string][];

export default function NewArticlePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", category: "helpdesk" as KBCategory, content: "",
    tags: "", ticketTypeLink: "", isPublic: false, status: "draft" as "draft" | "published",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set(k: string, v: string | boolean) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.title.trim() || !form.content.trim()) return;
    setSaving(true); setError(null);
    try {
      const now = new Date().toISOString();
      const article = await createArticle({
        title:          form.title,
        category:       form.category,
        content:        form.content,
        tags:           form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        ticketTypeLink: form.ticketTypeLink || undefined,
        status:         form.status,
        isPublic:       form.isPublic,
        authorUid:      profile.uid,
        authorName:     profile.displayName ?? profile.email,
        createdAt:      now,
        updatedAt:      now,
        viewCount:      0,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "knowledge", entityId: article.id, entityRef: form.title, details: `KB article ${form.status === "published" ? "published" : "saved as draft"}: "${form.title}" (${form.category})`, timestamp: now });
      router.push(`/dashboard/knowledge/${article.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">New Article</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Add knowledge base article or runbook</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="surface-card p-6 space-y-4">
          <div>
            <label className="field-label">Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Article title" className="input-field" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Category</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className="input-field">
                {CATEGORIES.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="vpn, setup, windows" className="input-field" />
            </div>
          </div>
          <div>
            <label className="field-label">Ticket Type Link (optional)</label>
            <input value={form.ticketTypeLink} onChange={(e) => set("ticketTypeLink", e.target.value)} placeholder="e.g. network_issue" className="input-field" />
          </div>
          <div>
            <label className="field-label">Content (Markdown supported)</label>
            <textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={20} className="input-field resize-y font-mono text-sm" placeholder="Write your article here. Use **bold**, # headings, - bullet points, ```code blocks```…" required />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isPublic} onChange={(e) => set("isPublic", e.target.checked)} className="w-4 h-4 accent-accent" />
              <span className="text-sm text-white/70 font-helvetica">Visible to clients (portal)</span>
            </label>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} onClick={() => set("status", "published")} className="btn-primary flex-1">
            {saving ? "Saving…" : "Publish Article"}
          </button>
          <button type="submit" disabled={saving} onClick={() => set("status", "draft")} className="flex-1 text-xs text-white/60 border border-white/15 hover:border-white/30 hover:text-white py-2.5 rounded-xl font-helvetica transition-colors">
            Save as Draft
          </button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
