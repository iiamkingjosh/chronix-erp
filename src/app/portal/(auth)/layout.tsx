"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import ChronixLogo from "@/components/ChronixLogo";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Dashboard",     href: "/portal" },
  { label: "Invoices",      href: "/portal/invoices" },
  { label: "Tickets",       href: "/portal/tickets" },
  { label: "Subscriptions", href: "/portal/subscriptions" },
];

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  const { profile, clientRecord, loading, signOut } = useClientAuth();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== "Client") {
      router.replace("/portal/login");
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #001a33 0%, #003366 50%, #001a33 100%)" }}>
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || profile.role !== "Client") return null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #001a33 0%, #002755 100%)" }}>
      {/* Top nav */}
      <header className="border-b border-white/10 bg-black/20 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChronixLogo size={28} />
            <div>
              <p className="font-orbitron text-xs font-black tracking-[0.1em] text-white leading-none">CHRONIX</p>
              <p className="font-orbitron text-[8px] tracking-[0.2em] text-secondary leading-none mt-0.5">
                CLIENT PORTAL · {APP_VERSION_SHORT_LABEL}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white font-helvetica">{profile.displayName ?? profile.email}</p>
              <p className="text-[10px] text-white/30 font-helvetica">{clientRecord?.company || clientRecord?.fullName || profile.email}</p>
            </div>
            <button
              onClick={signOut}
              className="text-xs text-white/30 hover:text-red-400 font-helvetica transition-colors border border-white/10 hover:border-red-400/20 px-3 py-1.5 rounded-lg"
            >
              Sign Out
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-0.5">
          {TABS.map((tab) => {
            const active = tab.href === "/portal" ? pathname === "/portal" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 py-2 text-xs font-medium font-helvetica border-b-2 -mb-px transition-all",
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
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
