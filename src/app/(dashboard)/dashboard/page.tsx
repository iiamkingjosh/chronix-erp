"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_COLORS, resolveRole } from "@/types/roles";
import type { ChronixUser } from "@/types/roles";
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

function KPI({ label, value, icon, accent = "text-white", sub, href }: KPIProps) {
  const card = (
    <div className={cn(
      "surface-card p-5 flex flex-col gap-2 min-h-[100px]",
      href && "hover:border-accent/30 transition-colors cursor-pointer"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40 uppercase tracking-widest font-helvetica leading-tight">{label}</span>
        <span className="text-xl leading-none">{icon}</span>
      </div>
      <p className={cn("font-orbitron text-2xl font-bold leading-none tabular-nums", accent)}>
        {value === "" || value === undefined || value === null ? "—" : value}
      </p>
      {sub && <p className="text-xs text-white/30 font-helvetica">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{card}</Link> : card;
}

function QuickAction({ label, href, icon }: { label: string; href: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-sm text-white/70 group-hover:text-white transition-colors font-helvetica flex-1">{label}</span>
      <span className="text-white/20 group-hover:text-accent text-xs transition-colors">→</span>
    </Link>
  );
}

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
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
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
          Welcome to Chronix ERP ·{" "}
          {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {canonical === "CEO"               && <CEODashboard />}
      {canonical === "CFO"               && <CFODashboard />}
      {canonical === "System Admin"      && <AdminDashboard />}
      {canonical === "Brand Lead"        && <BrandLeadDashboard />}
      {canonical === "Social Media Lead" && <BrandLeadDashboard />}
      {canonical === "HR"                && <HRDashboard profile={profile} />}
      {canonical === "Staff"             && <StaffDashboard profile={profile} />}
      {!["CEO","CFO","System Admin","Brand Lead","Social Media Lead","HR","Staff"].includes(canonical) && (
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
    revenueMTD: number; expenses: number; netProfit: number; outstanding: number;
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
    ]).then(([invoices, tickets, clients, projects, subs, pos, users]) => {
      const now = new Date();
      const revenueMTD    = invoices.filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(thisM)).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const expenses      = pos.filter((p) => p.status === "approved" || p.status === "delivered").reduce((s, p) => s + (Number(p.total) || 0), 0);
      const outstanding   = invoices.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + (Number(i.total) || 0), 0);
      const openTickets   = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
      const expiringSubs30 = subs.filter((s) => {
        if (s.cancelled) return false;
        const exp = String(s.expiryDate ?? "");
        if (!exp) return false;
        const days = Math.ceil((new Date(exp + "T00:00:00").getTime() - now.getTime()) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length;
      setM({
        revenueMTD, expenses, netProfit: revenueMTD - expenses, outstanding,
        openTickets, activeClients: clients.length,
        expiringSubs30, activeProjects: projects.filter((p) => p.status === "in_progress").length,
        teamHeadcount: users.length,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { revenueMTD: 0, expenses: 0, netProfit: 0, outstanding: 0, openTickets: 0, activeClients: 0, expiringSubs30: 0, activeProjects: 0, teamHeadcount: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CEO Command Centre" role="CEO" color="bg-purple-900/20 text-purple-200 border-purple-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Revenue MTD"          value={formatNaira(v.revenueMTD)}      icon="💰" accent="text-secondary"                                             href="/dashboard/finance/invoices" />
        <KPI label="Expenses"             value={formatNaira(v.expenses)}         icon="📦" accent="text-white"                                               href="/dashboard/procurement/orders" />
        <KPI label="Net Profit"           value={formatNaira(v.netProfit)}        icon="📈" accent={v.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}  />
        <KPI label="Outstanding (₦)"      value={formatNaira(v.outstanding)}      icon="📄" accent={v.outstanding > 0 ? "text-amber-400" : "text-white/50"}   href="/dashboard/finance/invoices" />
        <KPI label="Open Tickets"         value={v.openTickets}                   icon="🎫" accent={v.openTickets > 5 ? "text-accent" : "text-white"}          href="/dashboard/tickets" />
        <KPI label="Active Clients"       value={v.activeClients}                 icon="🏢" accent="text-emerald-400"                                          href="/dashboard/crm/clients" />
        <KPI label="Expiring ≤30 days"    value={v.expiringSubs30}                icon="🔔" accent={v.expiringSubs30 > 0 ? "text-amber-400" : "text-white/50"} href="/dashboard/subscriptions" />
        <KPI label="Active Projects"      value={v.activeProjects}                icon="📋" accent="text-secondary"                                            href="/dashboard/projects" />
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
    revenueMTD: number; expenses: number; netProfit: number; outstanding: number;
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
    ]).then(([invoices, pos]) => {
      const revenueMTD  = invoices.filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(thisM)).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const expenses    = pos.filter((p) => p.status === "approved" || p.status === "delivered").reduce((s, p) => s + (Number(p.total) || 0), 0);
      const outstanding = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + (Number(i.total) || 0), 0);
      const overdueDocs = invoices.filter((i) => i.status === "pending" && String(i.dueDate ?? "") < today);
      setM({
        revenueMTD, expenses, netProfit: revenueMTD - expenses, outstanding,
        overdueCount:   overdueDocs.length,
        overdueAmount:  overdueDocs.reduce((s, i) => s + (Number(i.total) || 0), 0),
        paidThisMonth:  invoices.filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(thisM)).length,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const v = m ?? { revenueMTD: 0, expenses: 0, netProfit: 0, outstanding: 0, overdueCount: 0, overdueAmount: 0, paidThisMonth: 0 };

  return (
    <div className="space-y-6">
      <SectionHeader title="CFO Finance Overview" role="CFO" color="bg-emerald-900/20 text-emerald-200 border-emerald-700/30" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Revenue MTD"          value={formatNaira(v.revenueMTD)}     icon="💰" accent="text-secondary"                                            href="/dashboard/finance/invoices" />
        <KPI label="Total Expenses"       value={formatNaira(v.expenses)}        icon="📦" accent="text-white"                                              href="/dashboard/procurement/orders" />
        <KPI label="Net Profit"           value={formatNaira(v.netProfit)}       icon="📈" accent={v.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
        <KPI label="Outstanding Invoices" value={formatNaira(v.outstanding)}     icon="📄" accent={v.outstanding > 0 ? "text-amber-400" : "text-white/50"}  href="/dashboard/finance/invoices" sub="pending payment" />
        <KPI label="Overdue Invoices"     value={`${v.overdueCount} invoices`}   icon="⚠️" accent={v.overdueCount > 0 ? "text-red-400" : "text-white/50"}   href="/dashboard/finance/invoices" sub={v.overdueCount > 0 ? formatNaira(v.overdueAmount) : undefined} />
        <KPI label="Payments Received"    value={`${v.paidThisMonth} this month`} icon="✅" accent="text-emerald-400"                                        href="/dashboard/finance/invoices" />
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
