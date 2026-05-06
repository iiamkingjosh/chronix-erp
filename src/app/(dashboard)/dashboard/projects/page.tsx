"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProjects } from "@/lib/projects-service";
import {
  PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES, PROJECT_TYPE_LABELS,
  formatProjDate, daysUntilDeadline, isDeadlineOverdue,
} from "@/types/projects";
import type { Project, Task } from "@/types/projects";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

interface OverdueTask { project: Project; task: Task; }

export default function ProjectsDashboard() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);

  const canManage = profile ? hasPermission(profile.role, "manage:projects") : false;
  const canSeeAll = profile ? hasPermission(profile.role, "view:all") || canManage : false;

  useEffect(() => {
    getProjects().then((all) => {
      if (canSeeAll) { setProjects(all); return; }
      setProjects(all.filter((p) =>
        p.team.some((m) => m.uid === profile?.uid) || p.createdBy === profile?.uid
      ));
    }).finally(() => setLoading(false));
  }, [profile?.uid, canSeeAll]);

  const active    = projects.filter((p) => p.status === "in_progress");
  const onHold    = projects.filter((p) => p.status === "on_hold");
  const completed = projects.filter((p) => p.status === "completed");

  const upcoming = projects
    .filter((p) => p.status !== "completed" && daysUntilDeadline(p.deadline) <= 14 && daysUntilDeadline(p.deadline) >= 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const overdueTasks: OverdueTask[] = [];
  for (const project of projects) {
    if (project.status === "completed") continue;
    for (const task of project.tasks ?? []) {
      if (task.status !== "done" && task.dueDate && isDeadlineOverdue(task.dueDate)) {
        if (!canSeeAll && task.assignedTo !== profile?.uid) continue;
        overdueTasks.push({ project, task });
      }
    }
  }
  overdueTasks.sort((a, b) => (a.task.dueDate ?? "").localeCompare(b.task.dueDate ?? ""));

  // Team workload: task count per person (in-progress + todo)
  const workload: Record<string, { name: string; count: number }> = {};
  for (const project of projects) {
    for (const task of project.tasks ?? []) {
      if (task.status === "done") continue;
      if (!workload[task.assignedTo]) workload[task.assignedTo] = { name: task.assignedName, count: 0 };
      workload[task.assignedTo].count++;
    }
  }
  const workloadList = Object.entries(workload)
    .map(([uid, v]) => ({ uid, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxLoad = workloadList[0]?.count || 1;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Active",    value: active.length,    color: "text-amber-400" },
          { label: "On Hold",   value: onHold.length,    color: "text-orange-400" },
          { label: "Completed", value: completed.length, color: "text-emerald-400" },
          { label: "Overdue Tasks", value: overdueTasks.length, color: overdueTasks.length > 0 ? "text-red-400" : "text-white" },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5 text-center">
            <p className={cn("font-orbitron text-3xl font-bold", s.color)}>{s.value}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming deadlines */}
        <div className="surface-card">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
              Deadlines (next 14 days)
            </h2>
            <Link href="/dashboard/projects/list" className="text-xs text-accent hover:text-accent/80 font-helvetica">
              View all →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-6 py-8 text-white/20 text-sm font-helvetica text-center">No upcoming deadlines.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {upcoming.map((p) => {
                const days = daysUntilDeadline(p.deadline);
                return (
                  <div key={p.id} className="px-6 py-3.5 flex items-center gap-4">
                    <div className={cn(
                      "shrink-0 w-12 text-center py-1 rounded-lg border",
                      days <= 3 ? "border-red-500/30 bg-red-500/10" : days <= 7 ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/[0.03]"
                    )}>
                      <p className={cn("font-orbitron text-xs font-bold", days <= 3 ? "text-red-400" : days <= 7 ? "text-amber-400" : "text-white/50")}>
                        {days}d
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/dashboard/projects/${p.id}`} className="text-sm font-semibold text-white hover:text-accent font-helvetica transition-colors line-clamp-1">
                        {p.name}
                      </Link>
                      <p className="text-xs text-white/30 font-helvetica">{p.clientName} · {formatProjDate(p.deadline)}</p>
                    </div>
                    <div className="shrink-0 w-20">
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div className="bg-accent rounded-full h-1.5 transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                      <p className="text-[10px] text-white/25 font-helvetica text-right mt-0.5">{p.progress}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue tasks */}
        <div className="surface-card">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest">
              Overdue Tasks
            </h2>
          </div>
          {overdueTasks.length === 0 ? (
            <p className="px-6 py-8 text-emerald-400 text-sm font-helvetica text-center font-semibold">All tasks on track ✓</p>
          ) : (
            <div className="divide-y divide-white/5">
              {overdueTasks.slice(0, 6).map(({ project, task }) => (
                <div key={task.id} className="px-6 py-3.5">
                  <Link href={`/dashboard/projects/${project.id}`} className="text-sm text-white hover:text-accent font-helvetica transition-colors line-clamp-1">
                    {task.title}
                  </Link>
                  <p className="text-xs text-white/30 font-helvetica mt-0.5">
                    {project.name} · {task.assignedName} · Due {formatProjDate(task.dueDate!)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team workload */}
      {canSeeAll && workloadList.length > 0 && (
        <div className="surface-card p-6">
          <h2 className="font-orbitron text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">
            Team Workload (open tasks)
          </h2>
          <div className="space-y-3">
            {workloadList.map((w) => (
              <div key={w.uid} className="flex items-center gap-4">
                <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                  {w.name[0]?.toUpperCase()}
                </div>
                <p className="text-sm text-white/60 font-helvetica w-36 shrink-0 truncate">{w.name}</p>
                <div className="flex-1 bg-white/10 rounded-full h-2">
                  <div
                    className="bg-secondary rounded-full h-2 transition-all"
                    style={{ width: `${(w.count / maxLoad) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-white/40 font-helvetica w-8 text-right shrink-0">{w.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className="flex gap-3">
          <Link href="/dashboard/projects/new" className="btn-primary">
            <PlusIcon /> New Project
          </Link>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
