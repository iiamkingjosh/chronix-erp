"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import ProtectedRoute from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

const ALL_TABS = [
  { label: "Tax Dashboard",   href: "/dashboard/tax",            roles: ["CEO", "CFO"] },
  { label: "VAT",             href: "/dashboard/tax/vat",        roles: ["CEO", "CFO"] },
  { label: "Withholding Tax", href: "/dashboard/tax/wht",        roles: ["CEO", "CFO"] },
  { label: "PAYE",            href: "/dashboard/tax/paye",       roles: ["CEO", "CFO", "HR"] },
  { label: "Corporate Tax",   href: "/dashboard/tax/corporate",  roles: ["CEO", "CFO"] },
];

export default function TaxLayout({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const { profile } = useAuth();

  const visibleTabs = ALL_TABS.filter(
    (t) => profile && (hasPermission(profile.role, "view:all") || t.roles.includes(profile.role))
  );

  return (
    <ProtectedRoute requiredPermission="view:tax">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-orbitron text-2xl font-bold text-white">Tax Management</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30 font-helvetica">
              Nigeria Tax Law
            </span>
          </div>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            VAT, WHT, PAYE and corporate tax tracking — estimates only, not tax filings
          </p>
        </div>

        <div className="flex mb-8 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {visibleTabs.map((tab) => {
            const active =
              tab.href === "/dashboard/tax"
                ? pathname === "/dashboard/tax"
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
