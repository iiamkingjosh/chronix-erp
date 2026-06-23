"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { ROLE_COLORS, ROLES, hasPermission, resolveRole } from "@/types/roles";
import ChronixLogo from "./ChronixLogo";
import { cn } from "@/lib/utils";

interface NavItem { label: string; href: string; icon: React.ReactNode; }

const ALL_NAV: NavItem[] = [
  { label: "Dashboard",     href: "/dashboard",                      icon: <GridIcon /> },
  { label: "Staff",         href: "/dashboard/staff",                icon: <UsersIcon /> },
  { label: "Finance",       href: "/dashboard/finance",              icon: <FinanceIcon /> },
  { label: "Tax",           href: "/dashboard/tax",                  icon: <TaxIcon /> },
  { label: "Tickets",       href: "/dashboard/tickets",              icon: <TicketIcon /> },
  { label: "CRM",           href: "/dashboard/crm",                  icon: <CRMIcon /> },
  { label: "Projects",      href: "/dashboard/projects",             icon: <ProjectsIcon /> },
  { label: "Vendors",       href: "/dashboard/procurement",          icon: <ProcureIcon /> },
  { label: "HR",            href: "/dashboard/hr",                   icon: <HRIcon /> },
  { label: "Assets",        href: "/dashboard/assets",               icon: <AssetIcon /> },
  { label: "Time Tracking", href: "/dashboard/time",                 icon: <ClockIcon /> },
  { label: "Subscriptions", href: "/dashboard/subscriptions",        icon: <SubIcon /> },
  { label: "Knowledge",     href: "/dashboard/knowledge",            icon: <BookIcon /> },
  { label: "Incidents",     href: "/dashboard/incidents",            icon: <AlertIcon /> },
  { label: "Changes",       href: "/dashboard/changes",              icon: <ChangeIcon /> },
  { label: "On-Call",       href: "/dashboard/oncall",               icon: <PhoneIcon /> },
  { label: "Brand",         href: "/dashboard/brand/assets",         icon: <BrandIcon /> },
  { label: "Analytics",     href: "/dashboard/analytics",            icon: <AnalyticsIcon /> },
  { label: "Audit Log",     href: "/dashboard/audit",                icon: <AuditIcon /> },
  { label: "Notifications", href: "/dashboard/notifications",        icon: <BellIcon /> },
  { label: "My Payslip",    href: "/dashboard/payslip",              icon: <PayslipIcon /> },
  { label: "Payroll Summary", href: "/dashboard/payroll-summary",    icon: <PayslipIcon /> },
  { label: "My Performance", href: "/dashboard/my-performance",       icon: <PerformanceIcon /> },
  { label: "Settings",      href: "/dashboard/settings",             icon: <SettingsIcon /> },
];

const NAV_GATE: Record<string, string[] | null> = {
  "/dashboard":                      null,
  "/dashboard/staff":                ["view:staff", "manage:staff", "manage:hr"],
  "/dashboard/finance":              ["view:finance", "manage:finance", "create:invoices"],
  "/dashboard/tax":                  ["view:tax", "manage:tax", "view:paye"],
  "/dashboard/tickets":              ["view:tickets", "manage:tickets"],
  "/dashboard/crm":                  ["view:crm", "manage:crm"],
  "/dashboard/projects":             ["view:projects", "manage:projects"],
  "/dashboard/procurement":          ["view:procurement", "manage:procurement"],
  "/dashboard/hr":                   ["view:hr", "manage:hr"],
  "/dashboard/assets":               ["view:assets", "manage:assets"],
  "/dashboard/time":                 ["view:time", "manage:time"],
  "/dashboard/subscriptions":        ["view:subscriptions", "manage:subscriptions"],
  "/dashboard/knowledge":            ["view:knowledge", "manage:knowledge"],
  "/dashboard/incidents":            ["view:incidents", "manage:incidents"],
  "/dashboard/changes":              ["view:changes", "manage:changes"],
  "/dashboard/oncall":               ["view:oncall", "manage:oncall"],
  "/dashboard/brand/assets":         ["view:brand", "manage:brand", "view:social", "manage:social"],
  "/dashboard/analytics":            ["view:analytics"],
  "/dashboard/audit":                ["view:audit"],
  "/dashboard/notifications":        ["view:notifications"],
  "/dashboard/payslip":              ["view:own", "manage:hr"],
  "/dashboard/payroll-summary":      ["view:payroll-summary"],
  "/dashboard/my-performance":       ["view:own", "manage:hr"],
  "/dashboard/settings":             ["view:settings", "manage:settings"],
};

function navHrefVisible(rawRole: string, href: string): boolean {
  if (resolveRole(rawRole) === ROLES.CLIENT) return false;
  const gate = NAV_GATE[href];
  if (gate === null) return true;
  if (!gate?.length) return false;
  return gate.some((p) => hasPermission(rawRole, p));
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth();
  const pathname             = usePathname();
  const [unread, setUnread]  = useState(0);

  // Lock body scroll on mobile when the drawer is open
  useEffect(() => {
    if (isOpen && window.innerWidth < 1024) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => { document.body.classList.remove("overflow-hidden"); };
  }, [isOpen]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!profile) return;

    const qRole = query(
      collection(db, "notifications"),
      where("targetRoles", "array-contains", profile.role),
      where("read", "==", false),
    );
    const qUid = query(
      collection(db, "notifications"),
      where("targetUids", "array-contains", profile.uid),
      where("read", "==", false),
    );

    let roleIds = new Set<string>();
    let uidIds  = new Set<string>();

    function recount() {
      setUnread(new Set([...roleIds, ...uidIds]).size);
    }

    const unsubRole = onSnapshot(qRole, (snap) => {
      roleIds = new Set(snap.docs.map((d) => d.id));
      recount();
    }, () => {});

    const unsubUid = onSnapshot(qUid, (snap) => {
      uidIds = new Set(snap.docs.map((d) => d.id));
      recount();
    }, () => {});

    return () => { unsubRole(); unsubUid(); };
  }, [profile]);

  if (!profile) return null;

  const canonical  = resolveRole(profile.role);
  const visibleNav = ALL_NAV.filter((item) => navHrefVisible(profile.role, item.href));
  const roleColor  = ROLE_COLORS[canonical] ?? "bg-white/10 text-white/50 border-white/20";

  return (
    <>
      {/* Mobile backdrop — fades in/out, hidden on lg+ */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar — fixed drawer on mobile, static in-flow on desktop */}
      <aside className={cn(
        "w-60 bg-primary-dark border-r border-white/10 flex flex-col",
        // Mobile: fixed overlay with slide transition
        "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: static in-flow, always visible, full height
        "lg:static lg:translate-x-0 lg:z-auto lg:shrink-0 lg:min-h-screen"
      )}>
        <Link
          href="/dashboard"
          onClick={onClose}
          className="px-5 py-5 border-b border-white/10 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
        >
          <ChronixLogo size={36} />
          <div>
            <p className="font-orbitron text-sm font-black tracking-[0.12em] text-white leading-none">CHRONIX</p>
            <p className="font-orbitron text-[9px] tracking-[0.2em] text-secondary mt-0.5 leading-none">ERP {APP_VERSION_SHORT_LABEL}</p>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            const isNotif = item.href === "/dashboard/notifications";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 font-helvetica",
                  active
                    ? "bg-accent/15 text-accent border border-accent/15 font-semibold"
                    : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                <span className="w-4 h-4 shrink-0 relative">
                  {item.icon}
                  {isNotif && unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-accent rounded-full border border-primary-dark" />
                  )}
                </span>
                <span className="flex-1">{item.label}</span>
                {isNotif && unread > 0 && (
                  <span className="ml-auto bg-accent/20 text-accent text-[9px] font-orbitron font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-xs font-bold text-white shrink-0 font-orbitron">
              {(profile.displayName ?? profile.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate font-helvetica">{profile.displayName ?? "User"}</p>
              <p className="text-xs text-white/30 truncate font-helvetica">{profile.email}</p>
            </div>
          </div>
          <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-3 font-helvetica", roleColor)}>
            {profile.role}
          </span>
          <button
            onClick={() => { onClose(); signOut(); }}
            className="w-full flex items-center gap-2 text-white/30 hover:text-red-400 text-xs font-helvetica transition-colors py-1.5 px-2 rounded-lg hover:bg-red-500/8"
          >
            <LogoutIcon /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

function GridIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function UsersIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function FinanceIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>; }
function TicketIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>; }
function CRMIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 12h-6"/><path d="M20 9l3 3-3 3"/></svg>; }
function ProjectsIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="3" y="3" width="7" height="4" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="10" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/></svg>; }
function ProcureIcon()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>; }
function HRIcon()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>; }
function AssetIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>; }
function ClockIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function SubIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function TaxIcon()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>; }
function BookIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
function AlertIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function ChangeIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>; }
function PhoneIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }
function BrandIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>; }
function AnalyticsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function AuditIcon()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>; }
function BellIcon()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function SettingsIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function LogoutIcon()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }

function PayslipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  );
}

function PerformanceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
