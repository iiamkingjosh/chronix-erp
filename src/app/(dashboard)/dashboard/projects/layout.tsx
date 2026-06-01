"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { profile } = useAuth();

  const canManage = profile ? hasPermission(profile.role, "manage:projects") : false;

  const tabs = canManage
    ? [
        { label: "Overview",     href: "/dashboard/projects" },
        { label: "All Projects", href: "/dashboard/projects/list" },
        { label: "New Project",  href: "/dashboard/projects/new" },
      ]
    : [
        { label: "Overview",    href: "/dashboard/projects" },
        { label: "My Projects", href: "/dashboard/projects/list?view=mine" },
      ];

  return (
    <ProtectedRoute requiredPermission="view:projects">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">Projects</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            Project delivery, task management and team workload
          </p>
        </div>
        <div className="flex mb-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const basePath = tab.href.split("?")[0];
            const active =
              tab.href === "/dashboard/projects"
                ? pathname === "/dashboard/projects"
                : pathname.startsWith(basePath);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-5 py-2.5 text-sm font-medium font-helvetica transition-all border-b-2 -mb-px shrink-0",
                  active
                    ? "text-accent border-accent"
                    : "text-white/40 border-transparent hover:text-white hover:border-white/20"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        {children}
      </div>
    </ProtectedRoute>
  );
}
