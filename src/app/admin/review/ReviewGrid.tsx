"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import ChronixLogo from "@/components/ChronixLogo";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { cn } from "@/lib/utils";

/* ── Page catalogue ─────────────────────────────────────────
   Each entry maps to an actual route in the app.
   `sameRoute` flags entries that share a URL but differ by
   logged-in role (the iframe will show whatever the current
   session sees).                                             */
interface PageEntry {
  id:         string;
  name:       string;
  route:      string;
  role:       string;
  roleColor:  string;
  section:    string;
  desc:       string;
  sameRoute?: boolean;   // true = another entry has the same URL
}

const PAGES: PageEntry[] = [
  /* ── Auth ── */
  {
    id: "login",
    name: "Login Page",
    route: "/login",
    role: "Public",
    roleColor: "bg-white/10 text-white/60 border-white/20",
    section: "Auth",
    desc: "Branded login with email/password, forgot-password flow and portal link.",
  },

  /* ── Dashboard (role-adaptive) ── */
  {
    id: "ceo-dash",
    name: "CEO Dashboard",
    route: "/dashboard",
    role: "CEO",
    roleColor: "bg-purple-900/40 text-purple-300 border-purple-700",
    section: "Dashboard",
    desc: "Command centre — Revenue MTD, Expenses, Net Profit, Open Tickets, Expiring Subs, Active Projects.",
    sameRoute: true,
  },
  {
    id: "cfo-dash",
    name: "CFO Dashboard",
    route: "/dashboard",
    role: "CFO",
    roleColor: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    section: "Dashboard",
    desc: "Finance KPIs — Revenue, Expenses, Net Profit, Overdue Invoices.",
    sameRoute: true,
  },
  {
    id: "admin-dash",
    name: "Admin Dashboard",
    route: "/dashboard",
    role: "System Admin",
    roleColor: "bg-blue-900/40 text-blue-300 border-blue-700",
    section: "Dashboard",
    desc: "Ops overview — Open Tickets, SLA Breaches, Expiring Subs, Delayed Projects.",
    sameRoute: true,
  },

  /* ── CRM ── */
  {
    id: "crm-leads",
    name: "CRM — Leads List",
    route: "/dashboard/crm/leads",
    role: "Brand Lead",
    roleColor: "bg-orange-900/40 text-orange-300 border-orange-700",
    section: "CRM",
    desc: "Lead pipeline list with stage filters, search, and conversion indicators.",
  },

  /* ── Finance ── */
  {
    id: "finance-invoices",
    name: "Finance — Invoices",
    route: "/dashboard/finance/invoices",
    role: "CFO",
    roleColor: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    section: "Finance",
    desc: "All invoices with status filters (Pending / Paid / Overdue), total summary bar.",
  },

  /* ── Tickets ── */
  {
    id: "tickets",
    name: "Tickets List",
    route: "/dashboard/tickets",
    role: "Staff",
    roleColor: "bg-slate-700/40 text-slate-300 border-slate-600",
    section: "Tickets",
    desc: "Support ticket queue with priority, SLA status badges and assignee filters.",
  },

  /* ── Projects ── */
  {
    id: "projects",
    name: "Projects List",
    route: "/dashboard/projects/list",
    role: "Staff",
    roleColor: "bg-slate-700/40 text-slate-300 border-slate-600",
    section: "Projects",
    desc: "All projects with progress bars, status chips and deadline indicators.",
  },

  /* ── Procurement ── */
  {
    id: "vendors",
    name: "Vendors List",
    route: "/dashboard/procurement",
    role: "CEO",
    roleColor: "bg-purple-900/40 text-purple-300 border-purple-700",
    section: "Procurement",
    desc: "Vendor registry with category, rating stars, status and payment terms.",
  },

  /* ── HR ── */
  {
    id: "hr-employees",
    name: "HR — Employee List",
    route: "/dashboard/hr",
    role: "HR",
    roleColor: "bg-teal-900/40 text-teal-300 border-teal-700",
    section: "HR",
    desc: "Employee roster with department, salary, bank details and performance notes.",
  },

  /* ── Subscriptions ── */
  {
    id: "subscriptions",
    name: "Subscriptions List",
    route: "/dashboard/subscriptions/list",
    role: "CFO",
    roleColor: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    section: "Subscriptions",
    desc: "All domains, licenses and contracts with expiry bands and renewal costs.",
  },

  /* ── Analytics ── */
  {
    id: "analytics",
    name: "Analytics Dashboard",
    route: "/dashboard/analytics",
    role: "CEO",
    roleColor: "bg-purple-900/40 text-purple-300 border-purple-700",
    section: "Analytics",
    desc: "KPI command centre — revenue charts, lead conversion funnel, team productivity.",
  },

  /* ── Notifications ── */
  {
    id: "notifications",
    name: "Notification Centre",
    route: "/dashboard/notifications",
    role: "All Staff",
    roleColor: "bg-secondary/20 text-secondary border-secondary/40",
    section: "Notifications",
    desc: "Unified alert feed — overdue invoices, expiring subs, SLA breaches. Filter + mark read.",
  },

  /* ── Client Portal ── */
  {
    id: "portal",
    name: "Client Portal",
    route: "/portal",
    role: "Client",
    roleColor: "bg-accent/20 text-accent border-accent/40",
    section: "Portal",
    desc: "Separate client-facing portal — services, invoices, tickets and subscription renewals.",
  },
];

/* ── Scale config ────────────────────────────────────────────
   We render each iframe at NATIVE_W × NATIVE_H then scale it
   down to DISPLAY_W × DISPLAY_H via CSS transform.           */
const NATIVE_W  = 1440;
const NATIVE_H  = 820;
const DISPLAY_W = 480;
const DISPLAY_H = 273;   // maintains 16:9 approx
const SCALE     = DISPLAY_W / NATIVE_W;   // ~0.333

const SECTIONS = ["All", "Auth", "Dashboard", "CRM", "Finance", "Tickets", "Projects", "Procurement", "HR", "Subscriptions", "Analytics", "Notifications", "Portal"] as const;

/* ── Preview card ─────────────────────────────────────────── */
function PreviewCard({ page }: { page: PageEntry }) {
  const [loaded, setLoaded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function reload() {
    if (iframeRef.current) {
      iframeRef.current.src = page.route;
      setLoaded(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col group hover:border-accent/30 transition-all duration-200">
      {/* ── Card header ── */}
      <div className="px-4 py-3 border-b border-white/10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-orbitron text-xs font-semibold text-white/80 truncate">{page.name}</span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica shrink-0", page.roleColor)}>
              {page.role}
            </span>
          </div>
          <code className="text-[10px] text-accent/60 font-mono">{page.route}</code>
          {page.sameRoute && (
            <p className="text-[10px] text-amber-400/60 font-helvetica mt-0.5">
              ⚠ Role-adaptive route — shows current session&apos;s view
            </p>
          )}
        </div>
        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          <button
            title="Reload iframe"
            onClick={reload}
            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-colors"
          >
            ↺
          </button>
          <Link
            href={page.route}
            target="_blank"
            rel="noopener noreferrer"
            className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-colors text-xs"
            title="Open in new tab"
          >
            ↗
          </Link>
        </div>
      </div>

      {/* ── Iframe preview ── */}
      <div
        className="relative cursor-pointer"
        style={{ width: `${DISPLAY_W}px`, height: `${DISPLAY_H}px`, overflow: "hidden" }}
        onClick={() => setInteractive((v) => !v)}
        title={interactive ? "Click to lock (disable interaction)" : "Click to interact with page"}
      >
        {/* Loading skeleton */}
        {!loaded && (
          <div className="absolute inset-0 bg-[#001833] flex flex-col items-center justify-center gap-3 z-10">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] text-white/20 font-helvetica">Loading preview…</p>
          </div>
        )}

        {/* Interaction overlay */}
        {!interactive && loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2">
              <p className="text-xs text-white font-helvetica">Click to interact</p>
            </div>
          </div>
        )}
        {interactive && (
          <div className="absolute top-2 right-2 z-10 bg-accent/90 rounded-lg px-2 py-0.5">
            <p className="text-[10px] text-white font-helvetica font-semibold">LIVE — click to lock</p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={page.route}
          title={page.name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{
            width:              `${NATIVE_W}px`,
            height:             `${NATIVE_H}px`,
            transform:          `scale(${SCALE})`,
            transformOrigin:    "0 0",
            pointerEvents:      interactive ? "auto" : "none",
            border:             "none",
            backgroundColor:    "#001833",
          }}
        />
      </div>

      {/* ── Card footer ── */}
      <div className="px-4 py-3 border-t border-white/8">
        <p className="text-[11px] text-white/30 font-helvetica leading-relaxed">{page.desc}</p>
      </div>
    </div>
  );
}

/* ── Main review grid ──────────────────────────────────────── */
export default function ReviewGrid() {
  const [section, setSection] = useState<string>("All");

  const filtered = section === "All" ? PAGES : PAGES.filter((p) => p.section === section);

  const sameRouteCount = PAGES.filter((p) => p.sameRoute).length;

  return (
    <div className="min-h-screen bg-[#001020]">
      {/* ── Dev mode banner ── */}
      <div className="sticky top-0 z-50 bg-amber-500/90 backdrop-blur-sm border-b border-amber-400/40 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-amber-900 text-amber-200 text-[10px] font-orbitron font-bold px-2 py-0.5 rounded-full tracking-wider">
            DEV ONLY
          </span>
          <p className="text-amber-900 text-xs font-semibold font-helvetica">
            This page is not accessible in production. For internal review only.
          </p>
        </div>
        <div className="flex items-center gap-2 text-amber-900 text-xs font-helvetica">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          development mode
        </div>
      </div>

      {/* ── Header ── */}
      <header className="px-8 py-8 border-b border-white/10">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <ChronixLogo size={44} />
            <div>
              <h1 className="font-orbitron text-2xl font-bold text-white tracking-wide">
                Platform Review
              </h1>
              <p className="font-orbitron text-xs text-secondary tracking-[0.2em] mt-0.5">
                CHRONIX ERP · ALL PAGES · {APP_VERSION_SHORT_LABEL}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-5 text-xs font-helvetica text-white/40">
            <span>
              <span className="text-white font-semibold">{PAGES.length}</span> pages
            </span>
            <span>
              <span className="text-white font-semibold">{new Set(PAGES.map((p) => p.section)).size}</span> sections
            </span>
            <span>
              <span className="text-amber-400 font-semibold">{sameRouteCount}</span> role-adaptive routes
            </span>
            <span className="ml-auto text-white/20">
              Iframes share your current session — pages show what the logged-in user sees.
              Click any preview to interact, click again to lock.
            </span>
          </div>
        </div>
      </header>

      {/* ── Section filter tabs ── */}
      <div className="sticky top-[36px] z-40 bg-[#001020]/95 backdrop-blur-sm border-b border-white/10 px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex gap-1.5 overflow-x-auto pb-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors whitespace-nowrap shrink-0",
                section === s
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {s}
              {s !== "All" && (
                <span className="ml-1.5 text-white/20">
                  {PAGES.filter((p) => p.section === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Preview grid ── */}
      <main className="px-8 py-8 max-w-[1600px] mx-auto">
        {/* Section groupings */}
        {section === "All" ? (
          <div className="space-y-12">
            {(["Auth", "Dashboard", "CRM", "Finance", "Tickets", "Projects", "Procurement", "HR", "Subscriptions", "Analytics", "Notifications", "Portal"] as const).map((sec) => {
              const items = PAGES.filter((p) => p.section === sec);
              if (!items.length) return null;
              return (
                <section key={sec}>
                  <div className="flex items-center gap-3 mb-5">
                    <h2 className="font-orbitron text-sm font-semibold text-white/50 uppercase tracking-widest">
                      {sec}
                    </h2>
                    <div className="flex-1 h-px bg-white/8" />
                    <span className="text-xs text-white/20 font-helvetica">{items.length} page{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div
                    className="grid gap-6"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${DISPLAY_W}px, 1fr))` }}
                  >
                    {items.map((page) => (
                      <PreviewCard key={page.id} page={page} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${DISPLAY_W}px, 1fr))` }}
          >
            {filtered.map((page) => (
              <PreviewCard key={page.id} page={page} />
            ))}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="mt-16 pt-8 border-t border-white/8">
          <h3 className="font-orbitron text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">
            Role Legend
          </h3>
          <div className="flex flex-wrap gap-3">
            {[
              { role: "CEO",               color: "bg-purple-900/40 text-purple-300 border-purple-700" },
              { role: "CFO",               color: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
              { role: "System Admin",      color: "bg-blue-900/40 text-blue-300 border-blue-700" },
              { role: "Brand Lead",        color: "bg-orange-900/40 text-orange-300 border-orange-700" },
              { role: "HR",                color: "bg-teal-900/40 text-teal-300 border-teal-700" },
              { role: "Staff",             color: "bg-slate-700/40 text-slate-300 border-slate-600" },
              { role: "Client (Portal)",   color: "bg-accent/20 text-accent border-accent/40" },
              { role: "All Staff",         color: "bg-secondary/20 text-secondary border-secondary/40" },
              { role: "Public",            color: "bg-white/10 text-white/60 border-white/20" },
            ].map((item) => (
              <span key={item.role} className={cn("text-[10px] font-semibold px-3 py-1 rounded-full border font-helvetica", item.color)}>
                {item.role}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/20 font-helvetica max-w-2xl">
            <strong className="text-white/40">Note:</strong> Iframes share your active browser session.
            Pages with ProtectedRoute will redirect to <code className="text-accent/60">/login</code> or{" "}
            <code className="text-accent/60">/unauthorized</code> if the current user lacks the required permission.
            Log in with the appropriate role account to see each page&apos;s full content.
            Role-adaptive routes (<span className="text-amber-400">⚠</span>) show the same URL with different
            content depending on the logged-in role — only one view is visible per session.
          </p>
        </div>
      </main>
    </div>
  );
}
