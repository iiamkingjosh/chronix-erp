"use client";

import { useEffect, useState } from "react";
import { getContentPosts, createContentPost, updatePostStatus } from "@/lib/brand-service";
import { PLATFORM_LABELS, POST_STATUS_STYLES } from "@/types/brand";
import type { ContentPost, Platform, PostStatus } from "@/types/brand";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const PLATFORMS = Object.entries(PLATFORM_LABELS) as [Platform, string][];
const today = new Date().toISOString().split("T")[0];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

export default function ContentCalendarPage() {
  const { profile }           = useAuth();
  const [posts, setPosts]     = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [form, setForm]       = useState({
    title: "", platform: "instagram" as Platform,
    scheduledDate: today, caption: "", assignedTo: "", notes: "",
  });
  const [saving, setSaving]   = useState(false);

  useEffect(() => { getContentPosts().then(setPosts).finally(() => setLoading(false)); }, []);

  const filtered = posts
    .filter((p) => filterStatus === "all"   || p.status === filterStatus)
    .filter((p) => filterPlatform === "all" || p.platform === filterPlatform);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.title) return;
    setSaving(true);
    const post = await createContentPost({
      title:         form.title,
      platform:      form.platform,
      scheduledDate: form.scheduledDate,
      caption:       form.caption || undefined,
      assignedTo:    form.assignedTo || undefined,
      notes:         form.notes || undefined,
      status:        "draft",
      createdBy:     profile.displayName ?? profile.email,
      createdAt:     new Date().toISOString(),
    });
    setPosts((prev) => [...prev, post].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
    setShowForm(false);
    setForm({ title: "", platform: "instagram", scheduledDate: today, caption: "", assignedTo: "", notes: "" });
    setSaving(false);
  }

  async function handleStatusChange(id: string, status: PostStatus) {
    await updatePostStatus(id, status);
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
  }

  const STATUS_FLOW: Partial<Record<PostStatus, PostStatus>> = {
    idea: "draft", draft: "scheduled", scheduled: "published",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Content Calendar</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Plan and track posts across all platforms</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-4 py-2.5">+ Add Post</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {(["idea","draft","scheduled","published","cancelled"] as PostStatus[]).map((s) => (
          <div key={s} className="surface-card p-4 text-center">
            <p className="font-orbitron text-xl font-bold text-white">{posts.filter((p) => p.status === s).length}</p>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize mt-1 inline-block", POST_STATUS_STYLES[s])}>{s}</span>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="surface-card p-6 mb-6 border border-accent/20 space-y-4 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">New Content Post</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="field-label">Title / Working Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Post title or brief" className="input-field" required />
            </div>
            <div>
              <label className="field-label">Platform</label>
              <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className="input-field">
                {PLATFORMS.map(([v, l]) => <option key={v} value={v} className="bg-primary-dark">{l}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Scheduled Date</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="field-label">Assigned To</label>
              <input value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="Team member name" className="input-field" />
            </div>
            <div>
              <label className="field-label">Notes</label>
              <input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Brief notes" className="input-field" />
            </div>
            <div className="sm:col-span-3">
              <label className="field-label">Caption (optional)</label>
              <textarea value={form.caption} onChange={(e) => set("caption", e.target.value)} rows={2} className="input-field resize-none" placeholder="Draft caption…" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-5">{saving ? "Saving…" : "Add Post"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica px-3">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="input-field w-40 text-xs">
          <option value="all" className="bg-primary-dark">All Platforms</option>
          {PLATFORMS.map(([v, l]) => <option key={v} value={v} className="bg-primary-dark">{l}</option>)}
        </select>
        {["all","idea","draft","scheduled","published","cancelled"].map((f) => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
              filterStatus === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
            )}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="surface-card overflow-hidden divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center"><p className="text-white/20 text-sm font-helvetica">No posts found.</p></div>
          ) : filtered.map((post) => (
            <div key={post.id} className="flex items-start gap-4 px-5 py-4">
              <div className="text-center shrink-0 w-14">
                <p className="text-[10px] text-white/30 font-helvetica">{fmtDate(post.scheduledDate)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-white font-helvetica">{post.title}</p>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", POST_STATUS_STYLES[post.status])}>{post.status}</span>
                  <span className="text-[10px] text-accent/70 font-helvetica">{PLATFORM_LABELS[post.platform]}</span>
                </div>
                {post.caption && <p className="text-xs text-white/40 font-helvetica truncate max-w-md">{post.caption}</p>}
                {post.assignedTo && <p className="text-[10px] text-white/25 font-helvetica mt-0.5">Assigned: {post.assignedTo}</p>}
              </div>
              <div className="shrink-0 flex gap-2">
                {STATUS_FLOW[post.status] && (
                  <button onClick={() => handleStatusChange(post.id, STATUS_FLOW[post.status]!)}
                    className="text-xs text-white/60 hover:text-white border border-white/15 hover:border-white/30 px-2.5 py-1 rounded-lg font-helvetica transition-colors capitalize">
                    → {STATUS_FLOW[post.status]}
                  </button>
                )}
                {post.status !== "cancelled" && post.status !== "published" && (
                  <button onClick={() => handleStatusChange(post.id, "cancelled")}
                    className="text-xs text-white/25 hover:text-red-400 border border-white/8 hover:border-red-500/20 px-2.5 py-1 rounded-lg font-helvetica transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
