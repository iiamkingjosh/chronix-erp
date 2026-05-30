"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import ProtectedRoute from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

const ALL_TABS = [
  { label: "Command Centre", href: "/dashboard/analytics",            roles: ["CEO", "System Admin"] },
  { label: "Sales & Revenue", href: "/dashboard/analytics/sales",     roles: ["CEO", "CFO", "Brand Lead", "Social Media Lead"] },
  { label: "Service Delivery", href: "/dashboard/analytics/service",  roles: ["CEO", "System Admin", "CFO"] },
  { label: "Team Productivity", href: "/dashboard/analytics/team",    roles: ["CEO", "HR", "System Admin"] },
  { label: "Client Retention", href: "/dashboard/analytics/retention",roles: ["CEO", "Brand Lead", "Social Media Lead", "CFO"] },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname        = usePathname();
  const { profile }     = useAuth();

  const visibleTabs = ALL_TABS.filter(
    (t) => profile && (hasPermission(profile.role, "view:all") || t.roles.includes(profile.role))
  );

  return (
    <ProtectedRoute requiredPermission="view:analytics">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">Analytics & KPIs</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            Real-time business intelligence and performance metrics
          </p>
        </div>
        <div className="flex mb-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {visibleTabs.map((tab) => {
            const active =
              tab.href === "/dashboard/analytics"
                ? pathname === "/dashboard/analytics"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-5 py-2.5 text-sm font-medium font-helvetica transition-all border-b-2 -mb-px whitespace-nowrap shrink-0",
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
