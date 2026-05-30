"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { cn } from "@/lib/utils";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { profile } = useAuth();

  const canManage  = profile ? hasPermission(profile.role, "manage:hr") : false;
  const canPayroll = canManage || (profile ? hasPermission(profile.role, "view:hr") && profile.role === "CFO" : false);

  const TABS = [
    ...(canManage ? [
      { label: "Employees",    href: "/dashboard/hr" },
      { label: "Add Employee", href: "/dashboard/hr/new" },
      { label: "Payroll",      href: "/dashboard/hr/payroll" },
      { label: "Performance",  href: "/dashboard/hr/performance" },
    ] : [
      { label: "My Profile",   href: `/dashboard/hr/${profile?.uid ?? ""}` },
      ...(canPayroll ? [{ label: "Payroll", href: "/dashboard/hr/payroll" }] : []),
    ]),
  ];

  return (
    <ProtectedRoute requiredPermission="view:hr">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">HR & Payroll</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            Employee records, payroll management and performance
          </p>
        </div>
        <div className="flex mb-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const active =
              tab.href === "/dashboard/hr"
                ? pathname === "/dashboard/hr"
                : pathname.startsWith(tab.href);
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
