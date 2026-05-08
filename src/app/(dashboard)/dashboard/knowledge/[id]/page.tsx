"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getArticle, updateArticleStatus, incrementViewCount } from "@/lib/knowledge-service";
import { KB_CATEGORY_LABELS, KB_CATEGORY_ICONS } from "@/types/knowledge";
import type { KBArticle } from "@/types/knowledge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, "<h3 class='text-base font-bold text-white font-orbitron mt-5 mb-2'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-lg font-bold text-white font-orbitron mt-6 mb-3'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold text-white font-orbitron mt-6 mb-3'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong class='text-white font-semibold'>$1</strong>")
    .replace(/`(.+?)`/g, "<code class='bg-white/10 text-accent px-1.5 py-0.5 rounded text-xs font-mono'>$1</code>")
    .replace(/^```[\s\S]*?```$/gm, (m) => `<pre class='bg-white/5 border border-white/10 rounded-xl px-4 py-3 overflow-x-auto text-xs font-mono text-white/70 my-3'>${m.slice(3, -3).replace(/^[a-z]+\n/, "")}</pre>`)
    .replace(/^- (.+)$/gm, "<li class='ml-4 text-white/70 font-helvetica text-sm list-disc'>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-4 text-white/70 font-helvetica text-sm list-decimal'>$2</li>")
    .replace(/\n\n/g, "</p><p class='text-white/70 font-helvetica text-sm mb-3'>")
    .replace(/\n/g, "<br/>");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ArticlePage() {
  const { id }                  = useParams() as { id: string };
  const router                  = useRouter();
  const { profile }             = useAuth();
  const [article, setArticle]   = useState<KBArticle | null>(null);
  const [loading, setLoading]   = useState(true);

  const canManage = profile?.role === "System Admin" || profile?.role === "CEO";

  useEffect(() => {
    getArticle(id).then((a) => {
      setArticle(a);
      if (a) incrementViewCount(id).catch(() => {});
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  if (!article) return <div className="p-8 text-white/40 font-helvetica">Article not found. <button onClick={() => router.back()} className="text-accent hover:underline">Go back</button></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button>
        <Link href="/dashboard/knowledge" className="text-xs text-white/30 hover:text-white font-helvetica transition-colors">Knowledge Base</Link>
        <span className="text-white/15">/</span>
        <span className="text-xs text-white/50 font-helvetica truncate">{article.title}</span>
      </div>

      <article className="surface-card overflow-hidden">
        <div className="bg-white/[0.03] border-b border-white/10 px-8 py-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl mt-1 shrink-0">{KB_CATEGORY_ICONS[article.category]}</span>
            <div className="flex-1 min-w-0">
              <h1 className="font-orbitron text-xl font-bold text-white leading-snug">{article.title}</h1>
              <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-white/30 font-helvetica">
                <span>{KB_CATEGORY_LABELS[article.category]}</span>
                <span>By {article.authorName}</span>
                <span>Updated {fmtDate(article.updatedAt)}</span>
                <span>{article.viewCount} views</span>
                {article.status !== "published" && (
                  <span className={cn("px-2 py-0.5 rounded-full border font-semibold capitalize",
                    article.status === "draft" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-white/8 text-white/30 border-white/15"
                  )}>{article.status}</span>
                )}
              </div>
              {article.tags.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {article.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded font-helvetica">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div
            className="prose-chronix"
            dangerouslySetInnerHTML={{ __html: `<p class="text-white/70 font-helvetica text-sm mb-3">${renderMarkdown(article.content)}</p>` }}
          />
        </div>
      </article>

      {canManage && (
        <div className="flex gap-3 mt-4">
          {article.status === "draft" && (
            <button onClick={() => updateArticleStatus(article.id, "published").then(() => setArticle((a) => a ? { ...a, status: "published" } : a))}
              className="text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 px-4 py-2 rounded-xl font-helvetica transition-colors">
              Publish
            </button>
          )}
          {article.status === "published" && (
            <button onClick={() => updateArticleStatus(article.id, "archived").then(() => setArticle((a) => a ? { ...a, status: "archived" } : a))}
              className="text-xs text-white/40 hover:text-white border border-white/10 px-4 py-2 rounded-xl font-helvetica transition-colors">
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}
