"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getProjects } from "@/lib/projects-service";
import {
  PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES,
  PROJECT_TYPE_LABELS, formatProjDate, daysUntilDeadline, isDeadlineOverdue,
} from "@/types/projects";
import type { Project, ProjectStatus } from "@/types/projects";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

function ProjectsListContent() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState<"all" | ProjectStatus>("all");

  const canManage    = profile ? hasPermission(profile.role, "manage:projects") : false;
  const canSeeAll    = profile ? hasPermission(profile.role, "view:all") || canManage : false;
  const searchParams = useSearchParams();
  const viewMine     = !canSeeAll || searchParams.get("view") === "mine";

  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    setLoading(true);
    getProjects()
      .then((all) => {
        if (cancelled) return;
        if (viewMine) {
          setProjects(all.filter((p) =>
            p.team.some((m) => m.uid === profile.uid) || p.createdBy === profile.uid
          ));
        } else {
          setProjects(all);
        }
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile?.uid, viewMine]);

  const filtered = projects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, clients…" className="input-field pl-10"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all","not_started","in_progress","on_hold","completed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica transition-colors border",
                filter === s
                  ? s === "all" ? "bg-white/10 text-white border-white/20" : cn(PROJECT_STATUS_STYLES[s as ProjectStatus])
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {s === "all" ? `All (${projects.length})` : PROJECT_STATUS_LABELS[s as ProjectStatus]}
            </button>
          ))}
        </div>
        {canManage && (
          <Link href="/dashboard/projects/new" className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap">
            <PlusIcon /> New Project
          </Link>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {projects.length === 0 ? "No projects yet." : "No projects match filters."}
            </p>
            {canManage && projects.length === 0 && (
              <Link href="/dashboard/projects/new" className="mt-3 inline-block text-accent text-sm font-helvetica hover:underline">
                Create first project →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {["Project","Client","Type","Status","Team","Start","Deadline","Progress"].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica first:pl-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => {
                  const days     = daysUntilDeadline(p.deadline);
                  const overdue  = isDeadlineOverdue(p.deadline) && p.status !== "completed";
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5">
                        <Link href={`/dashboard/projects/${p.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors">
                          {p.name}
                        </Link>
                        <p className="text-[10px] text-accent/70 font-orbitron mt-0.5">{p.projectId}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white/60 font-helvetica">{p.clientName}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-[10px] font-helvetica text-white/40">{PROJECT_TYPE_LABELS[p.type]}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PROJECT_STATUS_STYLES[p.status])}>
                          {PROJECT_STATUS_LABELS[p.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex -space-x-1">
                          {p.team.slice(0, 4).map((m) => (
                            <div key={m.uid} title={m.name} className="w-6 h-6 rounded-full bg-secondary/20 border border-primary flex items-center justify-center text-[9px] font-bold text-secondary">
                              {m.name[0]?.toUpperCase()}
                            </div>
                          ))}
                          {p.team.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-white/10 border border-primary flex items-center justify-center text-[9px] font-bold text-white/40">
                              +{p.team.length - 4}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-white/40 font-helvetica whitespace-nowrap">{formatProjDate(p.startDate)}</td>
                      <td className="px-5 py-3.5">
                        <p className={cn("text-xs font-helvetica whitespace-nowrap", overdue ? "text-red-400" : days <= 7 ? "text-amber-400" : "text-white/40")}>
                          {formatProjDate(p.deadline)}
                        </p>
                        {overdue && <p className="text-[10px] text-red-400 font-helvetica">Overdue</p>}
                      </td>
                      <td className="px-5 py-3.5 min-w-[100px]">
                        <div className="w-full bg-white/10 rounded-full h-1.5 mb-1">
                          <div className={cn("rounded-full h-1.5 transition-all", p.progress === 100 ? "bg-emerald-400" : "bg-accent")} style={{ width: `${p.progress}%` }} />
                        </div>
                        <p className="text-[10px] text-white/30 font-helvetica">{p.progress}%</p>
                      </td>
                    </tr>
                  );
                })}
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

export default function ProjectsListPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ProjectsListContent />
    </Suspense>
  );
}
