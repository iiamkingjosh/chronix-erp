"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getArticles, updateArticleStatus } from "@/lib/knowledge-service";
import { KB_CATEGORY_LABELS, KB_CATEGORY_ICONS } from "@/types/knowledge";
import type { KBArticle, KBCategory, KBStatus } from "@/types/knowledge";
import { useAuth } from "@/contexts/AuthContext";
import { isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(KB_CATEGORY_LABELS) as KBCategory[];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function KnowledgePage() {
  const { profile }             = useAuth();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("published");

  const canManage = !!profile && (
    isRootAdmin(profile.role) ||
    profile.role === "System Admin" ||
    profile.role === "CEO"
  );

  useEffect(() => { getArticles().then(setArticles).finally(() => setLoading(false)); }, []);

  const filtered = articles
    .filter((a) => statusFilter === "all" || a.status === statusFilter)
    .filter((a) => catFilter === "all"   || a.category === catFilter)
    .filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));

  async function handleStatusChange(id: string, status: KBStatus) {
    await updateArticleStatus(id, status);
    setArticles((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-orbitron text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Internal documentation, runbooks and procedures</p>
        </div>
        {canManage && <Link href="/dashboard/knowledge/new" className="btn-primary text-xs px-4 py-2.5">+ New Article</Link>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Articles",   value: articles.length },
          { label: "Published",        value: articles.filter((a) => a.status === "published").length },
          { label: "Drafts",           value: articles.filter((a) => a.status === "draft").length },
          { label: "Total Views",      value: articles.reduce((s, a) => s + a.viewCount, 0) },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className="font-orbitron text-2xl font-bold text-white">{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {CATEGORIES.map((cat) => {
          const count = articles.filter((a) => a.category === cat && a.status === "published").length;
          return (
            <button key={cat} onClick={() => { setCatFilter(cat); setStatusFilter("published"); }}
              className={cn("surface-card p-4 text-left transition-colors hover:border-accent/30 border border-transparent",
                catFilter === cat && "border-accent/30 bg-accent/5"
              )}>
              <span className="text-xl">{KB_CATEGORY_ICONS[cat]}</span>
              <p className="text-xs font-semibold text-white font-helvetica mt-2 leading-tight">{KB_CATEGORY_LABELS[cat]}</p>
              <p className="text-[10px] text-white/30 font-helvetica mt-0.5">{count} article{count !== 1 ? "s" : ""}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles or tags…" className="input-field flex-1 min-w-[200px]" />
        <div className="flex gap-2">
          {["all", "published", "draft", "archived"].map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={cn("px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors capitalize",
                statusFilter === f ? "bg-accent/15 text-accent border-accent/30" : "text-white/40 border-white/10 hover:text-white hover:border-white/20"
              )}>
              {f}
            </button>
          ))}
        </div>
        {catFilter !== "all" && (
          <button onClick={() => setCatFilter("all")} className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 px-3 py-1.5 rounded-lg">
            × {KB_CATEGORY_LABELS[catFilter as KBCategory]}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="surface-card px-6 py-16 text-center">
              <p className="text-white/20 text-sm font-helvetica">No articles found.</p>
              {canManage && <Link href="/dashboard/knowledge/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">Write the first article →</Link>}
            </div>
          ) : filtered.map((article) => (
            <div key={article.id} className="surface-card px-5 py-4 flex items-start gap-4 hover:border-white/15 transition-colors border border-white/5">
              <span className="text-2xl mt-0.5 shrink-0">{KB_CATEGORY_ICONS[article.category]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <Link href={`/dashboard/knowledge/${article.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors leading-tight">
                    {article.title}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {article.status !== "published" && (
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize",
                        article.status === "draft"    ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                        article.status === "archived" ? "bg-white/8 text-white/30 border-white/15" : ""
                      )}>{article.status}</span>
                    )}
                    {!article.isPublic && <span className="text-[10px] text-white/20 font-helvetica">Internal</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-white/30 font-helvetica">{KB_CATEGORY_LABELS[article.category]}</span>
                  <span className="text-[10px] text-white/20 font-helvetica">By {article.authorName}</span>
                  <span className="text-[10px] text-white/20 font-helvetica">Updated {fmtDate(article.updatedAt)}</span>
                  <span className="text-[10px] text-white/20 font-helvetica">{article.viewCount} views</span>
                  {article.tags.length > 0 && article.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] bg-white/5 text-white/40 border border-white/10 px-1.5 py-0.5 rounded font-helvetica">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/dashboard/knowledge/${article.id}`} className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors">Read</Link>
                {canManage && article.status === "draft" && (
                  <button onClick={() => handleStatusChange(article.id, "published")} className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg font-helvetica transition-colors">Publish</button>
                )}
                {canManage && article.status === "published" && (
                  <button onClick={() => handleStatusChange(article.id, "archived")} className="text-xs text-white/30 border border-white/10 hover:bg-white/5 px-2.5 py-1 rounded-lg font-helvetica transition-colors">Archive</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
