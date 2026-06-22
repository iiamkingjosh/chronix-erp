"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_COLORS, resolveRole } from "@/types/roles";
import type { ChronixUser } from "@/types/roles";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { formatNaira } from "@/types/finance";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function monthPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

/** Read all docs from a Firestore collection, returning an empty array on any error */
async function safeDocs(col: string): Promise<Record<string, unknown>[]> {
  try {
    const snap = await getDocs(collection(db, col));
    return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/* ── Shared UI atoms ─────────────────────────────────────── */

function Spinner() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="surface-card p-5 h-24">
          <div className="w-8 h-2 bg-white/8 rounded mb-3" />
          <div className="w-16 h-6 bg-white/12 rounded" />
        </div>
      ))}
    </div>
  );
}

interface KPIProps {
  label:   string;
  value:   string | number;
  icon:    string;
  accent?: string;
  sub?:    string;
  href?:   string;
}

const KPI = memo(function KPI({ label, value, icon, accent = "text-white", sub, href }: KPIProps) {
  const card = (
    <div className={cn(
      "surface-card p-5 flex flex-col gap-2 min-h-[100px] overflow-hidden",
      href && "hover:border-accent/30 transition-colors cursor-pointer"
    )}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[10px] text-white/40 uppercase tracking-widest font-helvetica leading-tight">{label}</span>
        <span className="text-xl leading-none shrink-0">{icon}</span>
      </div>
      <p className={cn("font-orbitron text-xl font-bold leading-none tabular-nums truncate", accent)}>
        {value === "" || value === undefined || value === null ? "—" : value}
      </p>
      {sub && <p className="text-xs text-white/30 font-helvetica truncate">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{card}</Link> : card;
});

const QuickAction = memo(function QuickAction({ label, href, icon }: { label: string; href: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-sm text-white/70 group-hover:text-white transition-colors font-helvetica flex-1">{label}</span>
      <span className="text-white/20 group-hover:text-accent text-xs transition-colors">→</span>
    </Link>
  );
});

function SectionHeader({ title, role, color }: { title: string; role: string; color: string }) {
  return (
    <div className={cn("px-5 py-3 rounded-xl border mb-5 flex items-center gap-3", color)}>
      <span className="font-orbitron text-sm font-bold">{title}</span>
      <span className="text-[10px] opacity-60 font-helvetica ml-auto">{role} view</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Root                                                          */
/* ──────────────────────────────────────────────────────────── */

export default function DashboardHome() {
  const { profile } = useAuth();
  if (!profile) return <div className="p-8"><Spinner /></div>;

  const canonical = resolveRole(profile.role);
  const roleColor = ROLE_COLORS[canonical] ?? "bg-white/10 text-white/50 border-white/20";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-orbitron text-2xl font-bold text-white">
            {getGreeting()}, {profile.displayName?.split(" ")[0] ?? "there"}
          </h1>
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border font-helvetica", roleColor)}>
            {profile.role}
          </span>
        </div>
        <p className="text-white/40 text-sm font-helvetica">
          Welcome to Chronix ERP {APP_VERSION_SHORT_LABEL} ·{" "}
          {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {canonical === "CEO"              && <CEODashboard />}
      {canonical === "CFO"              && <CFODashboard />}
      {canonical === "Root Admin"       && <AdminDashboard />}
      {canonical === "System Admin"     && <AdminDashboard />}
      {canonical === "Brand Lead"       && <BrandLeadDashboard />}
      {canonical === "Social Media Lead"&& <BrandLeadDashboard />}
      {canonical === "HR"               && <HRDashboard profile={profile} />}
      {canonical === "Staff"            && <StaffDashboard profile={profile} />}
      {canonical === "Sales Rep"        && <SalesRepDashboard profile={profile} />}
      {canonical === "Project Manager"  && <ProjectManagerDashboard profile={profile} />}
      {canonical === "Finance Officer"  && <FinanceOfficerDashboard />}
      {canonical === "IT Manager"       && <ITManagerDashboard />}
      {canonical === "Executive Assistant" && <ExecutiveAssistantDashboard />}
      {!["Root Admin","CEO","CFO","System Admin","Brand Lead","Social Media Lead","HR","Staff",
         "Sales Rep","Project Manager","Finance Officer","IT Manager","Executive Assistant"].includes(canonical) && (
        <GenericDashboard profile={profile} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* CEO Dashboard                                                 */
/* ──────────────────────────────────────────────────────────── */
function CEODashboard() {
  interface M {
    revenueMTD: number; totalRevenuePaid: number; expenses: number; netProfit: number; outstanding: number;
    openTickets: number; activeClients: number; expiringSubs30: number;
    activeProjects: number; teamHeadcount: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thisM = monthPrefix();
    Promise.all([
      safeDocs("invoices"),
      safeDocs("tickets"),
      safeDocs("clients"),
      safeDocs("projects"),
      safeDocs("subscriptions"),
      safeDocs("purchase_orders"),
      safeDocs("users"),
      safeDocs("expenses"),
    ]).then(([invoices, tickets, clients, projects, subs, pos, users, expenseClaims]) => {
      const now = new Date();
      const paid             = invoices.filter((i) => i.status === "paid");
      const revenueMTD       = paid.filter((i) => String(i.invoiceDate ?? "").startsWith(thisM)).reduce((s, i) => s + (Number(i.subtotal) || Number(i.total) || 0), 0);
      const totalRevenuePaid = paid.reduce((s, i) => s + (Number(i.subtotal) || Number(i.total) || 0), 0);
      const claimsTotal      = expenseClaims.filter((e) => e.status === "paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const poTotal          = pos.filter((p) => p.status === "paid").reduce((s, p) => s + (Number(p.total) || 0), 0);
      const expenses         = claimsTotal + poTotal;
      const claimsMTD        = expenseClaims.filter((e) => e.status === "paid" && String(e.date ?? "").startsWith(thisM)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const poMTD            = pos.filter((p) => p.status === "paid" && String(p.createdAt ?? "").startsWith(thisM)).reduce((s, p) => s + (Number(p.total) || 0), 0);
      const expensesMTD      = claimsMTD + poMTD;
      const outstanding      = invoices.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + (Number(i.total) || 0), 0);
      const openTickets      = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
      const expiringSubs30   = subs.filter((s) => {
        if (s.cancelled) return false;
        const exp = String(s.expiryDate ?? "");
        if (!exp) return false;
        const days = Math.ceil((new Date(exp + "T00:00:00").getTime() - now.getTime()) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length;
      setM({
        revenueMTD, totalRevenuePaid, expenses, netProfit: revenueMTD - expensesMTD, outstanding,
        openTickets, activeClients: clients.length,
        expiringSubs30, activeProjects: projects.filter((p) => p.status === "in_progress").length,
        teamHeadcount: users.length,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { revenueMTD: 0, totalRevenuePaid: 0, expenses: 0, netProfit: 0, outstanding: 0, openTickets: 0, activeClients: 0, expiringSubs30: 0, activeProjects: 0, teamHeadcount: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CEO Command Centre" role="CEO" color="bg-purple-900/20 text-purple-200 border-purple-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Revenue (This Month)"  value={formatNaira(v.revenueMTD)}      icon="💰" accent="text-secondary"                                             href="/dashboard/finance/invoices" sub={`All time: ${formatNaira(v.totalRevenuePaid)} (excl. VAT)`} />
        <KPI label="Expenses"              value={formatNaira(v.expenses)}         icon="📦" accent="text-white"                                               href="/dashboard/procurement/orders" />
        <KPI label="Net Profit (MTD)"      value={formatNaira(v.netProfit)}        icon="📈" accent={v.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}  />
        <KPI label="Outstanding (₦)"       value={formatNaira(v.outstanding)}      icon="📄" accent={v.outstanding > 0 ? "text-amber-400" : "text-white/50"}   href="/dashboard/finance/invoices" />
        <KPI label="Open Tickets"          value={v.openTickets}                   icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"}          href="/dashboard/tickets" />
        <KPI label="Active Clients"        value={v.activeClients}                 icon="🏢" accent="text-emerald-400"                                          href="/dashboard/crm/clients" />
        <KPI label="Expiring ≤30 days"     value={v.expiringSubs30}                icon="🔔" accent={v.expiringSubs30 > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/subscriptions" />
        <KPI label="Active Projects"       value={v.activeProjects}                icon="📋" accent="text-secondary"                                            href="/dashboard/projects" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Invoice"    href="/dashboard/finance/invoices/new"  icon="➕" />
          <QuickAction label="Add Lead"       href="/dashboard/crm/leads/new"         icon="👤" />
          <QuickAction label="New Ticket"     href="/dashboard/tickets/new"           icon="🎫" />
          <QuickAction label="Analytics"      href="/dashboard/analytics"             icon="📊" />
          <QuickAction label="New Project"    href="/dashboard/projects/new"          icon="📋" />
          <QuickAction label="HR Team"        href="/dashboard/hr"                    icon="👥" />
          <QuickAction label="Notifications"  href="/dashboard/notifications"         icon="🔔" />
          <QuickAction label="Settings"       href="/dashboard/settings"              icon="⚙️" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* CFO Dashboard                                                 */
/* ──────────────────────────────────────────────────────────── */
function CFODashboard() {
  interface M {
    revenueMTD: number; totalRevenuePaid: number; expenses: number; netProfit: number; outstanding: number;
    overdueCount: number; overdueAmount: number; paidThisMonth: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thisM = monthPrefix();
    const today = todayStr();
    Promise.all([
      safeDocs("invoices"),
      safeDocs("purchase_orders"),
      safeDocs("expenses"),
    ]).then(([invoices, pos, expenseClaims]) => {
      const paid             = invoices.filter((i) => i.status === "paid");
      const revenueMTD       = paid.filter((i) => String(i.invoiceDate ?? "").startsWith(thisM)).reduce((s, i) => s + (Number(i.subtotal) || Number(i.total) || 0), 0);
      const totalRevenuePaid = paid.reduce((s, i) => s + (Number(i.subtotal) || Number(i.total) || 0), 0);
      const claimsTotal      = expenseClaims.filter((e) => e.status === "paid").reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const poTotal          = pos.filter((p) => p.status === "paid").reduce((s, p) => s + (Number(p.total) || 0), 0);
      const expenses         = claimsTotal + poTotal;
      const claimsMTD        = expenseClaims.filter((e) => e.status === "paid" && String(e.date ?? "").startsWith(thisM)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const poMTD            = pos.filter((p) => p.status === "paid" && String(p.createdAt ?? "").startsWith(thisM)).reduce((s, p) => s + (Number(p.total) || 0), 0);
      const expensesMTD      = claimsMTD + poMTD;
      const outstanding      = invoices.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + (Number(i.total) || 0), 0);
      const overdueDocs      = invoices.filter((i) => i.status === "pending" && String(i.dueDate ?? "") < today);
      setM({
        revenueMTD, totalRevenuePaid, expenses, netProfit: revenueMTD - expensesMTD, outstanding,
        overdueCount:   overdueDocs.length,
        overdueAmount:  overdueDocs.reduce((s, i) => s + (Number(i.total) || 0), 0),
        paidThisMonth:  paid.filter((i) => String(i.invoiceDate ?? "").startsWith(thisM)).length,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { revenueMTD: 0, totalRevenuePaid: 0, expenses: 0, netProfit: 0, outstanding: 0, overdueCount: 0, overdueAmount: 0, paidThisMonth: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CFO Finance Overview" role="CFO" color="bg-emerald-900/20 text-emerald-200 border-emerald-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Revenue (This Month)"  value={formatNaira(v.revenueMTD)}     icon="💰" accent="text-secondary"                                            href="/dashboard/finance/invoices" sub={`All time: ${formatNaira(v.totalRevenuePaid)} (excl. VAT)`} />
        <KPI label="Total Expenses"        value={formatNaira(v.expenses)}        icon="📦" accent="text-white"                                              href="/dashboard/procurement/orders" />
        <KPI label="Net Profit (MTD)"      value={formatNaira(v.netProfit)}       icon="📈" accent={v.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KPI label="Outstanding Invoices"  value={formatNaira(v.outstanding)}     icon="📄" accent={v.outstanding > 0 ? "text-amber-400" : "text-white/50"}  href="/dashboard/finance/invoices" sub="pending + overdue" />
        <KPI label="Overdue Invoices"      value={`${v.overdueCount} invoices`}   icon="⚠️" accent={v.overdueCount > 0 ? "text-red-400" : "text-white/50"}   href="/dashboard/finance/invoices" sub={v.overdueCount > 0 ? formatNaira(v.overdueAmount) : undefined} />
        <KPI label="Payments Received"     value={`${v.paidThisMonth} this month`} icon="✅" accent="text-emerald-400"                                        href="/dashboard/finance/invoices" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Invoice"      href="/dashboard/finance/invoices/new" icon="➕" />
          <QuickAction label="Record Payment"   href="/dashboard/finance/payments"     icon="💳" />
          <QuickAction label="Purchase Orders"  href="/dashboard/procurement/orders"   icon="📦" />
          <QuickAction label="Analytics"        href="/dashboard/analytics/sales"      icon="📊" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* System Admin Dashboard                                        */
/* ──────────────────────────────────────────────────────────── */
function AdminDashboard() {
  interface M {
    openTickets: number; slaBreached: number; expiringSubs30: number;
    activeProjects: number; delayedProjects: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeDocs("tickets"),
      safeDocs("subscriptions"),
      safeDocs("projects"),
    ]).then(([tickets, subs, projects]) => {
      const now = new Date();
      const open = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
      const expiringSubs30 = subs.filter((s) => {
        if (s.cancelled) return false;
        const exp = String(s.expiryDate ?? "");
        if (!exp) return false;
        const days = Math.ceil((new Date(exp + "T00:00:00").getTime() - now.getTime()) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length;
      const active  = projects.filter((p) => p.status === "in_progress" || p.status === "not_started");
      const delayed = active.filter((p) => {
        const dl = String(p.deadline ?? "");
        return dl && new Date(dl + "T23:59:59") < now;
      }).length;
      setM({
        openTickets:     open.length,
        slaBreached:     open.filter((t) => t.slaDeadline && new Date(String(t.slaDeadline)) < now).length,
        expiringSubs30,
        activeProjects:  projects.filter((p) => p.status === "in_progress").length,
        delayedProjects: delayed,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { openTickets: 0, slaBreached: 0, expiringSubs30: 0, activeProjects: 0, delayedProjects: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="System Admin — Operations" role="System Admin" color="bg-blue-900/20 text-blue-200 border-blue-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Open Tickets"         value={v.openTickets}                   icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"}          href="/dashboard/tickets" />
        <KPI label="SLA Breaches"         value={v.slaBreached}                   icon="⚠️" accent={v.slaBreached > 0 ? "text-red-400" : "text-emerald-400"}   href="/dashboard/tickets/sla" sub={v.slaBreached > 0 ? "Immediate action needed" : "All within SLA"} />
        <KPI label="Expiring Subs ≤30d"   value={v.expiringSubs30}                icon="🔔" accent={v.expiringSubs30 > 0 ? "text-amber-400" : "text-white/50"}  href="/dashboard/subscriptions" />
        <KPI label="Active Projects"      value={v.activeProjects}                icon="📋" accent="text-secondary"                                             href="/dashboard/projects" />
        <KPI label="Delayed Projects"     value={v.delayedProjects}               icon="⏰" accent={v.delayedProjects > 0 ? "text-red-400" : "text-white/50"}  href="/dashboard/projects" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Ticket"     href="/dashboard/tickets/new"      icon="🎫" />
          <QuickAction label="SLA Dashboard"  href="/dashboard/tickets/sla"      icon="⚠️" />
          <QuickAction label="Subscriptions"  href="/dashboard/subscriptions"    icon="🔔" />
          <QuickAction label="Settings"       href="/dashboard/settings"         icon="⚙️" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Brand Lead / Social Media Lead                               */
/* ──────────────────────────────────────────────────────────── */
function BrandLeadDashboard() {
  interface M { totalLeads: number; activeLeads: number; conversionRate: number; activeClients: number; pipelineValue: number; }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeDocs("leads"),
      safeDocs("clients"),
      safeDocs("invoices"),
    ]).then(([leads, clients, invoices]) => {
      const converted = leads.filter((l) => l.convertedAt || l.stage === "client" || l.stage === "retained");
      setM({
        totalLeads:     leads.length,
        activeLeads:    leads.filter((l) => l.stage === "lead" || l.stage === "prospect").length,
        conversionRate: leads.length > 0 ? Math.round((converted.length / leads.length) * 100) : 0,
        activeClients:  clients.length,
        pipelineValue:  invoices.filter((i) => i.status === "pending").reduce((s, i) => s + (Number(i.total) || 0), 0),
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { totalLeads: 0, activeLeads: 0, conversionRate: 0, activeClients: 0, pipelineValue: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CRM & Sales Overview" role="Brand Lead" color="bg-orange-900/20 text-orange-200 border-orange-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Total Leads"       value={v.totalLeads}                icon="👤" accent="text-secondary"                                         href="/dashboard/crm/leads" />
        <KPI label="Active Leads"      value={v.activeLeads}               icon="🔥" accent="text-accent"                                            href="/dashboard/crm/leads" />
        <KPI label="Conversion Rate"   value={`${v.conversionRate}%`}      icon="📈" accent={v.conversionRate >= 30 ? "text-emerald-400" : "text-amber-400"} />
        <KPI label="Active Clients"    value={v.activeClients}             icon="🏢" accent="text-emerald-400"                                       href="/dashboard/crm/clients" />
        <KPI label="Pipeline Value"    value={formatNaira(v.pipelineValue)} icon="💼" accent="text-secondary" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="Add Lead"       href="/dashboard/crm/leads/new"    icon="➕" />
          <QuickAction label="Pipeline Board" href="/dashboard/crm"              icon="📊" />
          <QuickAction label="Client List"    href="/dashboard/crm/clients"      icon="🏢" />
          <QuickAction label="Analytics"      href="/dashboard/analytics/sales"  icon="📈" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* HR Dashboard                                                  */
/* ──────────────────────────────────────────────────────────── */
function HRDashboard({ profile }: { profile: ChronixUser }) {
  interface M { headcount: number; departments: number; pendingReviews: number; payrollStatus: string; payrollPeriod: string; totalPayroll: number; }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeDocs("users"),
      safeDocs("payroll_runs"),
    ]).then(([users, payrollRuns]) => {
      const latest = payrollRuns.sort((a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month))[0];
      const depts  = new Set(users.map((e) => e.department).filter(Boolean)).size;
      setM({
        headcount:      users.length,
        departments:    depts,
        pendingReviews: users.filter((e) => !Array.isArray(e.performanceNotes) || (e.performanceNotes as unknown[]).length === 0).length,
        payrollStatus:  String(latest?.status ?? "none"),
        payrollPeriod:  latest ? `${latest.month}/${latest.year}` : "—",
        totalPayroll:   Number(latest?.totalNet) || 0,
      });
    }).finally(() => setLoading(false));
  }, [profile.uid]);

  if (loading) return <Spinner />;

  const v = m ?? { headcount: 0, departments: 0, pendingReviews: 0, payrollStatus: "none", payrollPeriod: "—", totalPayroll: 0 };
  const payrollAccent = v.payrollStatus === "completed" ? "text-emerald-400" : v.payrollStatus === "draft" ? "text-amber-400" : "text-white/40";

  return (
    <div className="space-y-6">
      <SectionHeader title="HR & People" role="HR" color="bg-teal-900/20 text-teal-200 border-teal-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Headcount"       value={v.headcount}                icon="👥" accent="text-white"         href="/dashboard/hr" />
        <KPI label="Departments"     value={v.departments}              icon="🏛️" accent="text-secondary"    href="/dashboard/hr" />
        <KPI label="Pending Reviews" value={v.pendingReviews}           icon="📝" accent={v.pendingReviews > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/hr/performance" />
        <KPI label="Payroll Period"  value={v.payrollPeriod}            icon="💼" accent={payrollAccent}      href="/dashboard/hr/payroll" sub={v.payrollStatus.toUpperCase()} />
        <KPI label="Payroll Total"   value={formatNaira(v.totalPayroll)} icon="💰" accent="text-secondary"   href="/dashboard/hr/payroll" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="Add Employee"  href="/dashboard/hr/new"             icon="➕" />
          <QuickAction label="Run Payroll"   href="/dashboard/hr/payroll"         icon="💰" />
          <QuickAction label="Performance"   href="/dashboard/hr/performance"     icon="📝" />
          <QuickAction label="My Profile"    href={`/dashboard/hr/${profile.uid}`} icon="👤" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Staff Dashboard                                              */
/* ──────────────────────────────────────────────────────────── */
function StaffDashboard({ profile }: { profile: ChronixUser }) {
  interface Task { title: string; project: string; status: string; }
  interface M { myOpenTickets: number; tasksPending: number; tasksCompleted: number; tasks: Task[]; }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeDocs("tickets"),
      safeDocs("projects"),
    ]).then(([tickets, projects]) => {
      const myOpen = tickets.filter((t) => t.assignedTo === profile.uid && (t.status === "open" || t.status === "in_progress")).length;
      const allMyTasks = projects.flatMap((p) =>
        (Array.isArray(p.tasks) ? p.tasks as Record<string, unknown>[] : [])
          .filter((t) => t.assignedTo === profile.uid)
          .map((t) => ({ title: String(t.title ?? ""), project: String(p.name ?? ""), status: String(t.status ?? "") }))
      );
      setM({
        myOpenTickets: myOpen,
        tasksPending:  allMyTasks.filter((t) => t.status !== "done").length,
        tasksCompleted: allMyTasks.filter((t) => t.status === "done").length,
        tasks: allMyTasks.filter((t) => t.status !== "done").slice(0, 6),
      });
    }).finally(() => setLoading(false));
  }, [profile.uid]);

  if (loading) return <Spinner />;

  const v = m ?? { myOpenTickets: 0, tasksPending: 0, tasksCompleted: 0, tasks: [] };

  return (
    <div className="space-y-6">
      <SectionHeader title="My Workspace" role="Staff" color="bg-slate-700/30 text-slate-200 border-slate-600/30" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPI label="My Open Tickets"  value={v.myOpenTickets}  icon="🎫" accent={v.myOpenTickets > 0 ? "text-accent" : "text-white/50"}  href="/dashboard/tickets" />
        <KPI label="Tasks Pending"    value={v.tasksPending}   icon="⏳" accent={v.tasksPending > 0 ? "text-amber-400" : "text-white/50"} />
        <KPI label="Tasks Completed"  value={v.tasksCompleted} icon="✅" accent="text-emerald-400" />
        <KPI label="My Profile"       value="View →"           icon="👤" accent="text-secondary"                                          href={`/dashboard/hr/${profile.uid}`} />
      </div>
      {v.tasks.length > 0 && (
        <div className="surface-card p-6">
          <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">My Active Tasks</p>
          <div className="space-y-2">
            {v.tasks.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className={cn("w-2 h-2 rounded-full shrink-0", t.status === "in_progress" ? "bg-amber-400" : "bg-white/20")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-helvetica truncate">{t.title}</p>
                  <p className="text-xs text-white/30 font-helvetica">{t.project}</p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-helvetica shrink-0",
                  t.status === "in_progress" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/30 border-white/10"
                )}>
                  {t.status === "in_progress" ? "In Progress" : "To Do"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction label="My Tickets"    href="/dashboard/tickets"              icon="🎫" />
          <QuickAction label="My Projects"   href="/dashboard/projects"             icon="📋" />
          <QuickAction label="My Profile"    href={`/dashboard/hr/${profile.uid}`}  icon="👤" />
          <QuickAction label="Notifications" href="/dashboard/notifications"        icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Sales Rep Dashboard                                           */
/* ──────────────────────────────────────────────────────────── */
function SalesRepDashboard({ profile }: { profile: ChronixUser }) {
  interface M {
    openLeads: number; prospects: number; clients: number;
    pendingInvoices: number; pendingAmount: number; draftInvoices: number;
    followUpsDue: number; myExpenses: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = todayStr();
    Promise.all([
      safeDocs("leads"),
      safeDocs("clients"),
      safeDocs("invoices"),
      safeDocs("expenses"),
    ]).then(([leads, clients, invoices, expenses]) => {
      const myInvoices = invoices.filter((i) => i.createdBy === profile.uid);
      setM({
        openLeads:       leads.filter((l) => l.stage === "lead").length,
        prospects:       leads.filter((l) => l.stage === "prospect").length,
        clients:         clients.length,
        pendingInvoices: myInvoices.filter((i) => i.approvalStatus === "pending_approval").length,
        pendingAmount:   myInvoices.filter((i) => i.approvalStatus === "pending_approval").reduce((s, i) => s + (Number(i.total) || 0), 0),
        draftInvoices:   myInvoices.filter((i) => i.approvalStatus === "draft").length,
        followUpsDue:    leads.filter((l) => Array.isArray(l.followUps) && (l.followUps as Record<string, unknown>[]).some((f) => !f.done && String(f.date ?? "") <= today)).length,
        myExpenses:      expenses.filter((e) => e.submittedByUid === profile.uid && e.status === "pending").length,
      });
    }).finally(() => setLoading(false));
  }, [profile.uid]);

  if (loading) return <Spinner />;
  const v = m ?? { openLeads: 0, prospects: 0, clients: 0, pendingInvoices: 0, pendingAmount: 0, draftInvoices: 0, followUpsDue: 0, myExpenses: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="Sales Workspace" role="Sales Rep" color="bg-cyan-900/20 text-cyan-200 border-cyan-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Open Leads"          value={v.openLeads}                 icon="🔥" accent="text-accent"                                                href="/dashboard/crm/leads" />
        <KPI label="Prospects"           value={v.prospects}                  icon="👤" accent="text-cyan-400"                                              href="/dashboard/crm/leads" />
        <KPI label="Active Clients"      value={v.clients}                    icon="🏢" accent="text-emerald-400"                                           href="/dashboard/crm/clients" />
        <KPI label="Follow-Ups Due"      value={v.followUpsDue}               icon="📅" accent={v.followUpsDue > 0 ? "text-amber-400" : "text-white/50"}    href="/dashboard/crm/follow-ups" />
        <KPI label="Awaiting Approval"   value={v.pendingInvoices}            icon="⏳" accent={v.pendingInvoices > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/finance/invoices" sub={v.pendingInvoices > 0 ? formatNaira(v.pendingAmount) : undefined} />
        <KPI label="Draft Invoices"      value={v.draftInvoices}              icon="📄" accent="text-white/60"                                              href="/dashboard/finance/invoices" />
        <KPI label="Pending Expenses"    value={v.myExpenses}                 icon="🧾" accent={v.myExpenses > 0 ? "text-amber-400" : "text-white/50"}      href="/dashboard/finance/expenses" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Lead"         href="/dashboard/crm/leads/new"         icon="➕" />
          <QuickAction label="Create Invoice"   href="/dashboard/finance/invoices/new"  icon="📄" />
          <QuickAction label="Log Expense"      href="/dashboard/finance/expenses/new"  icon="🧾" />
          <QuickAction label="CRM Pipeline"     href="/dashboard/crm"                   icon="📊" />
          <QuickAction label="Follow-Ups"       href="/dashboard/crm/follow-ups"        icon="📅" />
          <QuickAction label="Client List"      href="/dashboard/crm/clients"           icon="🏢" />
          <QuickAction label="My Invoices"      href="/dashboard/finance/invoices"      icon="💰" />
          <QuickAction label="Notifications"    href="/dashboard/notifications"         icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Project Manager Dashboard                                     */
/* ──────────────────────────────────────────────────────────── */
function ProjectManagerDashboard({ profile }: { profile: ChronixUser }) {
  interface M {
    activeProjects: number; completedProjects: number; delayedProjects: number;
    openTickets: number; slaBreaches: number;
    billableHours: number; totalHours: number;
    tasksDue: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thisM = monthPrefix();
    const today = todayStr();
    Promise.all([
      safeDocs("projects"),
      safeDocs("tickets"),
      safeDocs("time_entries"),
    ]).then(([projects, tickets, timeEntries]) => {
      const now    = new Date();
      const active = projects.filter((p) => p.status === "in_progress" || p.status === "not_started");
      const myHours = timeEntries.filter((e) => e.employeeUid === profile.uid && String(e.date ?? "").startsWith(thisM));
      const allTasks = projects.flatMap((p) =>
        (Array.isArray(p.tasks) ? p.tasks as Record<string, unknown>[] : [])
          .filter((t) => t.status !== "done" && t.dueDate && String(t.dueDate) <= today)
      );
      setM({
        activeProjects:    active.length,
        completedProjects: projects.filter((p) => p.status === "completed").length,
        delayedProjects:   active.filter((p) => p.deadline && new Date(String(p.deadline) + "T23:59:59") < now).length,
        openTickets:       tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
        slaBreaches:       tickets.filter((t) => (t.status === "open" || t.status === "in_progress") && t.slaDeadline && new Date(String(t.slaDeadline)) < now).length,
        billableHours:     myHours.filter((e) => e.billable).reduce((s, e) => s + (Number(e.hours) || 0), 0),
        totalHours:        myHours.reduce((s, e) => s + (Number(e.hours) || 0), 0),
        tasksDue:          allTasks.length,
      });
    }).finally(() => setLoading(false));
  }, [profile.uid]);

  if (loading) return <Spinner />;
  const v = m ?? { activeProjects: 0, completedProjects: 0, delayedProjects: 0, openTickets: 0, slaBreaches: 0, billableHours: 0, totalHours: 0, tasksDue: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="Project Operations" role="Project Manager" color="bg-indigo-900/20 text-indigo-200 border-indigo-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Active Projects"    value={v.activeProjects}              icon="📋" accent="text-indigo-400"                                                href="/dashboard/projects" />
        <KPI label="Delayed Projects"   value={v.delayedProjects}             icon="⏰" accent={v.delayedProjects > 0 ? "text-red-400" : "text-white/50"}       href="/dashboard/projects" />
        <KPI label="Tasks Overdue"      value={v.tasksDue}                    icon="⚠️" accent={v.tasksDue > 0 ? "text-amber-400" : "text-white/50"} />
        <KPI label="Completed"          value={v.completedProjects}           icon="✅" accent="text-emerald-400"                                               href="/dashboard/projects" />
        <KPI label="Open Tickets"       value={v.openTickets}                 icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"}               href="/dashboard/tickets" />
        <KPI label="SLA Breaches"       value={v.slaBreaches}                 icon="🚨" accent={v.slaBreaches > 0 ? "text-red-400" : "text-emerald-400"}        href="/dashboard/tickets/sla" />
        <KPI label="Billable Hrs (MTD)" value={`${v.billableHours.toFixed(1)}h`} icon="⏱️" accent="text-secondary"                                             href="/dashboard/time" />
        <KPI label="Total Hrs (MTD)"    value={`${v.totalHours.toFixed(1)}h`} icon="🕐" accent="text-white"                                                    href="/dashboard/time" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Project"     href="/dashboard/projects/new"    icon="➕" />
          <QuickAction label="Log Time"        href="/dashboard/time"            icon="⏱️" />
          <QuickAction label="New Ticket"      href="/dashboard/tickets/new"     icon="🎫" />
          <QuickAction label="SLA Dashboard"   href="/dashboard/tickets/sla"     icon="⚠️" />
          <QuickAction label="All Projects"    href="/dashboard/projects/list"   icon="📋" />
          <QuickAction label="Knowledge Base"  href="/dashboard/knowledge"       icon="📖" />
          <QuickAction label="Analytics"       href="/dashboard/analytics"       icon="📊" />
          <QuickAction label="Notifications"   href="/dashboard/notifications"   icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Finance Officer Dashboard                                     */
/* ──────────────────────────────────────────────────────────── */
function FinanceOfficerDashboard() {
  interface M {
    draftInvoices: number; pendingApproval: number; approvedInvoices: number;
    overdueInvoices: number; overdueAmount: number;
    pendingExpenses: number; pendingExpenseAmount: number;
    revenueMTD: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thisM = monthPrefix();
    const today = todayStr();
    Promise.all([
      safeDocs("invoices"),
      safeDocs("expenses"),
    ]).then(([invoices, expenses]) => {
      const overdue = invoices.filter((i) => i.status === "pending" && String(i.dueDate ?? "") < today);
      setM({
        draftInvoices:       invoices.filter((i) => i.approvalStatus === "draft").length,
        pendingApproval:     invoices.filter((i) => i.approvalStatus === "pending_approval").length,
        approvedInvoices:    invoices.filter((i) => i.approvalStatus === "approved" && i.status !== "paid").length,
        overdueInvoices:     overdue.length,
        overdueAmount:       overdue.reduce((s, i) => s + (Number(i.total) || 0), 0),
        pendingExpenses:     expenses.filter((e) => e.status === "pending").length,
        pendingExpenseAmount: expenses.filter((e) => e.status === "pending").reduce((s, e) => s + (Number(e.amount) || 0), 0),
        revenueMTD:          invoices.filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(thisM)).reduce((s, i) => s + (Number(i.total) || 0), 0),
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  const v = m ?? { draftInvoices: 0, pendingApproval: 0, approvedInvoices: 0, overdueInvoices: 0, overdueAmount: 0, pendingExpenses: 0, pendingExpenseAmount: 0, revenueMTD: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="Finance Operations" role="Finance Officer" color="bg-lime-900/20 text-lime-200 border-lime-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Revenue MTD"          value={formatNaira(v.revenueMTD)}        icon="💰" accent="text-secondary"                                             href="/dashboard/finance/invoices" />
        <KPI label="Awaiting Approval"    value={v.pendingApproval}                 icon="⏳" accent={v.pendingApproval > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/finance/invoices" />
        <KPI label="Approved / Unsent"    value={v.approvedInvoices}                icon="✅" accent="text-blue-400"                                              href="/dashboard/finance/invoices" />
        <KPI label="Draft Invoices"       value={v.draftInvoices}                   icon="📄" accent="text-white/50"                                              href="/dashboard/finance/invoices" />
        <KPI label="Overdue Invoices"     value={v.overdueInvoices}                 icon="⚠️" accent={v.overdueInvoices > 0 ? "text-red-400" : "text-white/50"}  href="/dashboard/finance/invoices" sub={v.overdueInvoices > 0 ? formatNaira(v.overdueAmount) : undefined} />
        <KPI label="Pending Expenses"     value={v.pendingExpenses}                 icon="🧾" accent={v.pendingExpenses > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/finance/expenses" sub={v.pendingExpenses > 0 ? formatNaira(v.pendingExpenseAmount) : undefined} />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Invoice"     href="/dashboard/finance/invoices/new" icon="➕" />
          <QuickAction label="Record Payment"  href="/dashboard/finance/payments"     icon="💳" />
          <QuickAction label="Log Expense"     href="/dashboard/finance/expenses/new" icon="🧾" />
          <QuickAction label="All Expenses"    href="/dashboard/finance/expenses"     icon="📊" />
          <QuickAction label="Financial Report"href="/dashboard/finance/reports"      icon="📈" />
          <QuickAction label="Tax Overview"    href="/dashboard/tax"                  icon="📋" />
          <QuickAction label="Purchase Orders" href="/dashboard/procurement/orders"   icon="📦" />
          <QuickAction label="Notifications"   href="/dashboard/notifications"        icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* IT Manager Dashboard                                          */
/* ──────────────────────────────────────────────────────────── */
function ITManagerDashboard() {
  interface M {
    openTickets: number; slaBreaches: number; criticalTickets: number;
    activeIncidents: number; p1Count: number;
    pendingChanges: number; assetsInRepair: number;
    warrantyExpiring: number; onCallEngineer: string;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const soon30 = new Date(); soon30.setDate(soon30.getDate() + 30);
    const now    = new Date();
    Promise.all([
      safeDocs("tickets"),
      safeDocs("incidents"),
      safeDocs("change_log"),
      safeDocs("assets"),
      safeDocs("oncall_schedule"),
    ]).then(([tickets, incidents, changes, assets, oncall]) => {
      const todayStr2 = now.toISOString().split("T")[0];
      const currentOC = oncall.find((s) => String(s.weekStart ?? "") <= todayStr2 && String(s.weekEnd ?? "") >= todayStr2);
      const openTkts  = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
      setM({
        openTickets:      openTkts.length,
        slaBreaches:      openTkts.filter((t) => t.slaDeadline && new Date(String(t.slaDeadline)) < now).length,
        criticalTickets:  openTkts.filter((t) => t.priority === "critical").length,
        activeIncidents:  incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length,
        p1Count:          incidents.filter((i) => i.severity === "P1" && i.status !== "closed").length,
        pendingChanges:   changes.filter((c) => c.status === "pending_approval").length,
        assetsInRepair:   assets.filter((a) => a.status === "in_repair").length,
        warrantyExpiring: assets.filter((a) => {
          const exp = String(a.warrantyExpiry ?? "");
          return exp && new Date(exp) <= soon30 && new Date(exp) >= now;
        }).length,
        onCallEngineer:   currentOC ? String(currentOC.engineerName ?? "—") : "Not assigned",
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  const v = m ?? { openTickets: 0, slaBreaches: 0, criticalTickets: 0, activeIncidents: 0, p1Count: 0, pendingChanges: 0, assetsInRepair: 0, warrantyExpiring: 0, onCallEngineer: "—" };

  return (
    <div className="space-y-6">
      <SectionHeader title="IT Operations Centre" role="IT Manager" color="bg-rose-900/20 text-rose-200 border-rose-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Open Tickets"       value={v.openTickets}       icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"}               href="/dashboard/tickets" />
        <KPI label="SLA Breaches"       value={v.slaBreaches}       icon="🚨" accent={v.slaBreaches > 0 ? "text-red-400" : "text-emerald-400"}        href="/dashboard/tickets/sla" sub={v.slaBreaches > 0 ? "Immediate action" : "All clear"} />
        <KPI label="Critical Tickets"   value={v.criticalTickets}   icon="🔴" accent={v.criticalTickets > 0 ? "text-red-400" : "text-white/50"}       href="/dashboard/tickets" />
        <KPI label="Active Incidents"   value={v.activeIncidents}   icon="⚡" accent={v.activeIncidents > 0 ? "text-orange-400" : "text-white/50"}    href="/dashboard/incidents" sub={v.p1Count > 0 ? `${v.p1Count} P1 critical` : undefined} />
        <KPI label="Pending Changes"    value={v.pendingChanges}    icon="🔄" accent={v.pendingChanges > 0 ? "text-amber-400" : "text-white/50"}      href="/dashboard/changes" />
        <KPI label="Assets in Repair"   value={v.assetsInRepair}    icon="🔧" accent={v.assetsInRepair > 0 ? "text-amber-400" : "text-white/50"}      href="/dashboard/assets" />
        <KPI label="Warranty Expiring"  value={v.warrantyExpiring}  icon="⏰" accent={v.warrantyExpiring > 0 ? "text-amber-400" : "text-white/50"}    href="/dashboard/assets" sub="next 30 days" />
        <KPI label="On-Call This Week"  value={v.onCallEngineer}    icon="📞" accent="text-rose-400"                                                   href="/dashboard/oncall" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="Declare Incident"    href="/dashboard/incidents/new"    icon="⚡" />
          <QuickAction label="New Change Request"  href="/dashboard/changes/new"      icon="🔄" />
          <QuickAction label="New Ticket"          href="/dashboard/tickets/new"      icon="🎫" />
          <QuickAction label="SLA Dashboard"       href="/dashboard/tickets/sla"      icon="🚨" />
          <QuickAction label="Asset Registry"      href="/dashboard/assets"           icon="🖥️" />
          <QuickAction label="On-Call Schedule"    href="/dashboard/oncall"           icon="📞" />
          <QuickAction label="Knowledge Base"      href="/dashboard/knowledge"        icon="📖" />
          <QuickAction label="Notifications"       href="/dashboard/notifications"    icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Executive Assistant — read-only briefing view for the CEO    */
/* ──────────────────────────────────────────────────────────── */
function ExecutiveAssistantDashboard() {
  interface M {
    outstanding: number; overdueCount: number;
    openTickets: number; expiringSubs30: number;
    activeProjects: number; activeClients: number;
  }
  const [m, setM]             = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeDocs("invoices"),
      safeDocs("tickets"),
      safeDocs("subscriptions"),
      safeDocs("projects"),
      safeDocs("clients"),
    ]).then(([invoices, tickets, subs, projects, clients]) => {
      const now = new Date();
      const expiringSubs30 = subs.filter((s) => {
        if (s.cancelled) return false;
        const exp = String(s.expiryDate ?? "");
        if (!exp) return false;
        const days = Math.ceil((new Date(exp + "T00:00:00").getTime() - now.getTime()) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length;
      setM({
        outstanding:    invoices.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + (Number(i.total) || 0), 0),
        overdueCount:   invoices.filter((i) => i.status === "overdue").length,
        openTickets:    tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
        expiringSubs30,
        activeProjects: projects.filter((p) => p.status === "in_progress").length,
        activeClients:  clients.length,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  const v = m ?? { outstanding: 0, overdueCount: 0, openTickets: 0, expiringSubs30: 0, activeProjects: 0, activeClients: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CEO Briefing" role="Executive Assistant" color="bg-violet-900/20 text-violet-200 border-violet-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Outstanding (₦)"      value={formatNaira(v.outstanding)}    icon="📄" accent={v.outstanding > 0 ? "text-amber-400" : "text-white/50"} sub={v.overdueCount > 0 ? `${v.overdueCount} overdue` : undefined} />
        <KPI label="Open Tickets"         value={v.openTickets}                 icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"} />
        <KPI label="Expiring ≤30 days"    value={v.expiringSubs30}              icon="🔔" accent={v.expiringSubs30 > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/subscriptions" />
        <KPI label="Active Projects"      value={v.activeProjects}              icon="📋" accent="text-secondary" />
        <KPI label="Active Clients"       value={v.activeClients}               icon="🏢" accent="text-emerald-400" />
      </div>
      <div className="surface-card p-6">
        <p className="font-orbitron text-xs text-white/30 uppercase tracking-widest mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="Financial Reports" href="/dashboard/finance/reports" icon="📈" />
          <QuickAction label="Analytics"          href="/dashboard/analytics"       icon="📊" />
          <QuickAction label="Knowledge Base"     href="/dashboard/knowledge"       icon="📖" />
          <QuickAction label="Notifications"      href="/dashboard/notifications"   icon="🔔" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Generic fallback                                             */
/* ──────────────────────────────────────────────────────────── */
function GenericDashboard({ profile }: { profile: ChronixUser }) {
  return (
    <div className="surface-card p-8 text-center space-y-3">
      <p className="font-orbitron text-sm font-semibold text-white/60">Welcome, {profile.displayName ?? profile.email}</p>
      <p className="text-white/30 text-sm font-helvetica">
        Role <span className="text-accent font-semibold">{profile.role}</span> is not yet configured for a custom dashboard.
        Contact your System Administrator.
      </p>
      <div className="flex gap-3 justify-center pt-2">
        <QuickAction label="Notifications" href="/dashboard/notifications" icon="🔔" />
      </div>
    </div>
  );
}
