"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_COLORS, resolveRole } from "@/types/roles";
import ChronixLogo from "./ChronixLogo";
import { cn } from "@/lib/utils";

interface NavItem { label: string; href: string; icon: React.ReactNode; }

const ALL_NAV: NavItem[] = [
  { label: "Dashboard",     href: "/dashboard",               icon: <GridIcon /> },
  { label: "Staff",         href: "/dashboard/staff",         icon: <UsersIcon /> },
  { label: "Finance",       href: "/dashboard/finance",       icon: <FinanceIcon /> },
  { label: "Tickets",       href: "/dashboard/tickets",       icon: <TicketIcon /> },
  { label: "CRM",           href: "/dashboard/crm",           icon: <CRMIcon /> },
  { label: "Projects",      href: "/dashboard/projects",      icon: <ProjectsIcon /> },
  { label: "Vendors",       href: "/dashboard/procurement",   icon: <ProcureIcon /> },
  { label: "HR",            href: "/dashboard/hr",            icon: <HRIcon /> },
  { label: "Subscriptions", href: "/dashboard/subscriptions", icon: <SubIcon /> },
  { label: "Analytics",     href: "/dashboard/analytics",     icon: <AnalyticsIcon /> },
  { label: "Notifications", href: "/dashboard/notifications", icon: <BellIcon /> },
  { label: "Settings",      href: "/dashboard/settings",      icon: <SettingsIcon /> },
];

/* ── Explicit nav per role ─────────────────────────────────── */
const ROLE_NAV: Record<string, string[]> = {
  /* Internal roles */
  "CEO": [
    "/dashboard", "/dashboard/crm", "/dashboard/finance", "/dashboard/tickets",
    "/dashboard/projects", "/dashboard/procurement", "/dashboard/hr",
    "/dashboard/subscriptions", "/dashboard/analytics", "/dashboard/notifications",
    "/dashboard/settings",
  ],
  "CFO": [
    "/dashboard", "/dashboard/finance", "/dashboard/procurement",
    "/dashboard/subscriptions", "/dashboard/analytics", "/dashboard/notifications",
  ],
  "System Admin": [
    "/dashboard", "/dashboard/staff", "/dashboard/tickets", "/dashboard/projects", "/dashboard/procurement",
    "/dashboard/subscriptions", "/dashboard/hr", "/dashboard/settings",
    "/dashboard/notifications",
  ],
  "Brand Lead": [
    "/dashboard", "/dashboard/crm", "/dashboard/analytics", "/dashboard/notifications",
  ],
  "Social Media Lead": [
    "/dashboard", "/dashboard/crm", "/dashboard/notifications",
  ],
  "HR": [
    "/dashboard", "/dashboard/hr", "/dashboard/notifications",
  ],
  "Staff": [
    "/dashboard", "/dashboard/tickets", "/dashboard/projects", "/dashboard/notifications",
  ],
  /* Legacy role aliases — map to nearest equivalent */
  "Admin":    ["/dashboard", "/dashboard/staff", "/dashboard/tickets", "/dashboard/projects", "/dashboard/procurement", "/dashboard/subscriptions", "/dashboard/hr", "/dashboard/settings", "/dashboard/notifications"],
  "Manager":  ["/dashboard", "/dashboard/crm", "/dashboard/finance", "/dashboard/tickets", "/dashboard/projects", "/dashboard/notifications"],
  "Finance":  ["/dashboard", "/dashboard/finance", "/dashboard/procurement", "/dashboard/subscriptions", "/dashboard/notifications"],
};

/* Minimum nav shown to any authenticated user regardless of role */
const FALLBACK_NAV = ["/dashboard", "/dashboard/notifications"];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();

  if (!profile) return null;

  const canonical    = resolveRole(profile.role);
  const allowedHrefs = ROLE_NAV[profile.role] ?? ROLE_NAV[canonical] ?? FALLBACK_NAV;
  const visibleNav   = ALL_NAV.filter((item) => allowedHrefs.includes(item.href));
  const roleColor    = ROLE_COLORS[canonical] ?? "bg-white/10 text-white/50 border-white/20";

  return (
    <aside className="w-60 shrink-0 bg-primary-dark border-r border-white/10 flex flex-col min-h-screen">
      {/* Brand — links to dashboard */}
      <Link
        href="/dashboard"
        className="px-5 py-5 border-b border-white/10 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
      >
        <ChronixLogo size={36} />
        <div>
          <p className="font-orbitron text-sm font-black tracking-[0.12em] text-white leading-none">CHRONIX</p>
          <p className="font-orbitron text-[9px] tracking-[0.2em] text-secondary mt-0.5 leading-none">ERP</p>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 font-helvetica",
                active
                  ? "bg-accent/15 text-accent border border-accent/15 font-semibold"
                  : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
              )}
            >
              <span className="w-4 h-4 shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User block */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-xs font-bold text-white shrink-0 font-orbitron">
            {(profile.displayName ?? profile.email ?? "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate font-helvetica">
              {profile.displayName ?? "User"}
            </p>
            <p className="text-xs text-white/30 truncate font-helvetica">{profile.email}</p>
          </div>
        </div>
        <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-3 font-helvetica", roleColor)}>
          {profile.role}
        </span>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 text-white/30 hover:text-red-400 text-xs font-helvetica
                     transition-colors py-1.5 px-2 rounded-lg hover:bg-red-500/8"
        >
          <LogoutIcon />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

/* ── Icons ── */
function GridIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function UsersIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function FinanceIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>; }
function TicketIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/><line x1="9" y1="12" x2="15" y2="12" strokeDasharray="2 2"/></svg>; }
function CRMIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 12h-6"/><path d="M20 9l3 3-3 3"/></svg>; }
function ProjectsIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="3" y="3" width="7" height="4" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="10" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/></svg>; }
function ProcureIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>; }
function HRIcon()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>; }
function SubIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>; }
function AnalyticsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function BellIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function SettingsIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function LogoutIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
