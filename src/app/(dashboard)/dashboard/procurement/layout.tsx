"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Vendors",         href: "/dashboard/procurement" },
  { label: "Purchase Orders", href: "/dashboard/procurement/orders" },
];

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProtectedRoute requiredPermission="view:procurement">
      <div className="p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">Procurement</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">
            Vendors, purchase orders and supply chain management
          </p>
        </div>
        <div className="flex mb-8 border-b border-white/10">
          {TABS.map((tab) => {
            const active =
              tab.href === "/dashboard/procurement"
                ? pathname === "/dashboard/procurement" || pathname.startsWith("/dashboard/procurement/vendors")
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-5 py-2.5 text-sm font-medium font-helvetica transition-all border-b-2 -mb-px",
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
