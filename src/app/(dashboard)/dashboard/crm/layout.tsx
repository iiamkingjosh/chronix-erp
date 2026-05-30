"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Pipeline",    href: "/dashboard/crm" },
  { label: "Leads",       href: "/dashboard/crm/leads" },
  { label: "Clients",     href: "/dashboard/crm/clients" },
  { label: "Follow-ups",  href: "/dashboard/crm/follow-ups" },
];

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProtectedRoute requiredPermission="view:crm">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">CRM</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            Leads, clients and relationship management
          </p>
        </div>

        <div className="flex mb-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const active =
              tab.href === "/dashboard/crm"
                ? pathname === "/dashboard/crm"
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
