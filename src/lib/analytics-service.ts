import { getInvoices } from "./finance-service";
import { getTickets, getStaffList } from "./tickets-service";
import { getLeads, getClients } from "./crm-service";
import { getProjects } from "./projects-service";
import { getSubscriptions } from "./subscriptions-service";
import { getDaysLeft } from "@/types/subscriptions";

/* Resolve a month string "YYYY-MM" from a Date */
function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function thisMonthStr() { return monthStr(new Date()); }
function lastMonthStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1); return monthStr(d);
}

/* Safe wrapper — any single failing collection returns [] instead of crashing */
const safe = <T,>(p: Promise<T[]>) => p.catch((): T[] => []);

/* ── Master Dashboard ───────────────────────────────────── */

export interface MasterDashboardData {
  revenueThisMonth:    number;
  revenueLastMonth:    number;
  outstandingInvoices: number;
  activeClientsCount:  number;
  openTicketsCount:    number;
  expiringSubsCount:   number;
  activeProjectsCount: number;
  teamHeadcount:       number;
}

export const EMPTY_MASTER: MasterDashboardData = {
  revenueThisMonth: 0, revenueLastMonth: 0, outstandingInvoices: 0,
  activeClientsCount: 0, openTicketsCount: 0, expiringSubsCount: 0,
  activeProjectsCount: 0, teamHeadcount: 0,
};

export async function getMasterDashboard(): Promise<MasterDashboardData> {
  const [invoices, tickets, clients, projects, subs, staff] = await Promise.all([
    safe(getInvoices()), safe(getTickets()), safe(getClients()),
    safe(getProjects()), safe(getSubscriptions()), safe(getStaffList()),
  ]);

  const thisM = thisMonthStr();
  const lastM = lastMonthStr();
  const paid  = invoices.filter((i) => i.status === "paid");

  return {
    revenueThisMonth:    paid.filter((i) => i.invoiceDate?.startsWith(thisM)).reduce((s, i) => s + (i.total ?? 0), 0),
    revenueLastMonth:    paid.filter((i) => i.invoiceDate?.startsWith(lastM)).reduce((s, i) => s + (i.total ?? 0), 0),
    outstandingInvoices: invoices.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + (i.total ?? 0), 0),
    activeClientsCount:  clients.length,
    openTicketsCount:    tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
    expiringSubsCount:   subs.filter((s) => { if (s.cancelled) return false; const d = getDaysLeft(s.expiryDate); return d >= 0 && d <= 60; }).length,
    activeProjectsCount: projects.filter((p) => p.status === "in_progress").length,
    teamHeadcount:       staff.length,
  };
}

/* ── Sales Analytics ────────────────────────────────────── */

export interface MonthlyRevenue { month: string; label: string; revenue: number; }

export interface SalesData {
  monthlyRevenue:        MonthlyRevenue[];
  revenueByClient:       { client: string; revenue: number }[];
  dealsClosedThisMonth:  number;
  leadConversionRate:    number;
  pipelineValue:         number;
  totalLeads:            number;
  convertedLeads:        number;
}

export const EMPTY_SALES: SalesData = {
  monthlyRevenue: [], revenueByClient: [],
  dealsClosedThisMonth: 0, leadConversionRate: 0,
  pipelineValue: 0, totalLeads: 0, convertedLeads: 0,
};

export async function getSalesAnalytics(): Promise<SalesData> {
  const [invoices, leads] = await Promise.all([safe(getInvoices()), safe(getLeads())]);

  const now = new Date();
  const months: MonthlyRevenue[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthStr(d);
    months.push({
      month: key,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      revenue: invoices.filter((inv) => inv.status === "paid" && inv.invoiceDate?.startsWith(key)).reduce((s, inv) => s + (inv.total ?? 0), 0),
    });
  }

  const clientRevMap: Record<string, number> = {};
  invoices.filter((i) => i.status === "paid").forEach((inv) => {
    clientRevMap[inv.client.name] = (clientRevMap[inv.client.name] ?? 0) + (inv.total ?? 0);
  });

  const totalLeads     = leads.length;
  const convertedLeads = leads.filter((l) => l.convertedAt || l.stage === "client" || l.stage === "retained").length;

  return {
    monthlyRevenue:       months,
    revenueByClient:      Object.entries(clientRevMap).map(([client, revenue]) => ({ client, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    dealsClosedThisMonth: invoices.filter((i) => i.status === "paid" && i.invoiceDate?.startsWith(thisMonthStr())).length,
    leadConversionRate:   totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0,
    pipelineValue:        invoices.filter((i) => i.status === "pending").reduce((s, i) => s + (i.total ?? 0), 0),
    totalLeads,
    convertedLeads,
  };
}

/* ── Service Delivery Analytics ─────────────────────────── */

export interface ServiceData {
  avgResolutionHours: number;
  slaBreachRate:      number;
  ticketsByPriority:  { priority: string; count: number }[];
  ticketsByStatus:    { status: string;   count: number }[];
  topIssues:          { title: string;    count: number }[];
  totalResolved:      number;
  totalBreached:      number;
}

export const EMPTY_SERVICE: ServiceData = {
  avgResolutionHours: 0, slaBreachRate: 0,
  ticketsByPriority: [], ticketsByStatus: [],
  topIssues: [], totalResolved: 0, totalBreached: 0,
};

export async function getServiceAnalytics(): Promise<ServiceData> {
  const tickets = await safe(getTickets());

  const resolved = tickets.filter((t) => t.resolvedAt);
  const avgResolutionHours = resolved.length
    ? resolved.reduce((sum, t) => sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0) / resolved.length
    : 0;

  const open     = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
  const breached = open.filter((t) => t.slaDeadline && new Date(t.slaDeadline) < new Date());

  const priorityCounts: Record<string, number> = {};
  tickets.forEach((t) => { priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1; });

  const statusCounts: Record<string, number> = {};
  tickets.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });

  const titleCounts: Record<string, number> = {};
  tickets.forEach((t) => { titleCounts[t.title] = (titleCounts[t.title] ?? 0) + 1; });

  return {
    avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
    slaBreachRate:      open.length > 0 ? Math.round((breached.length / open.length) * 100) : 0,
    ticketsByPriority:  Object.entries(priorityCounts).map(([priority, count]) => ({ priority, count })),
    ticketsByStatus:    Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    topIssues:          Object.entries(titleCounts).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    totalResolved:      resolved.length,
    totalBreached:      breached.length,
  };
}

/* ── Team Productivity ──────────────────────────────────── */

export interface TeamData {
  tasksCompleted:      { name: string; count: number }[];
  openTicketsPerStaff: { name: string; count: number }[];
  projectsOnTrack:     number;
  projectsDelayed:     number;
  totalProjects:       number;
}

export const EMPTY_TEAM: TeamData = {
  tasksCompleted: [], openTicketsPerStaff: [],
  projectsOnTrack: 0, projectsDelayed: 0, totalProjects: 0,
};

export async function getTeamAnalytics(): Promise<TeamData> {
  const [tickets, projects] = await Promise.all([safe(getTickets()), safe(getProjects())]);

  const taskMap: Record<string, { name: string; count: number }> = {};
  projects.forEach((p) => {
    p.tasks.filter((t) => t.status === "done").forEach((t) => {
      if (taskMap[t.assignedTo]) taskMap[t.assignedTo].count += 1;
      else taskMap[t.assignedTo] = { name: t.assignedName, count: 1 };
    });
  });

  const ticketMap: Record<string, { name: string; count: number }> = {};
  tickets.filter((t) => t.status === "open" || t.status === "in_progress").forEach((t) => {
    if (ticketMap[t.assignedTo]) ticketMap[t.assignedTo].count += 1;
    else ticketMap[t.assignedTo] = { name: t.assignedName, count: 1 };
  });

  const now     = new Date();
  const active  = projects.filter((p) => p.status === "in_progress" || p.status === "not_started");
  const delayed = active.filter((p) => p.deadline && new Date(p.deadline + "T23:59:59") < now).length;

  return {
    tasksCompleted:      Object.values(taskMap).sort((a, b) => b.count - a.count),
    openTicketsPerStaff: Object.values(ticketMap).sort((a, b) => b.count - a.count),
    projectsOnTrack:     active.length - delayed,
    projectsDelayed:     delayed,
    totalProjects:       projects.length,
  };
}

/* ── Client Retention ───────────────────────────────────── */

export interface RetentionData {
  activeClients:     number;
  retainedLeads:     number;
  retentionRate:     number;
  avgClientValue:    number;
  topClientsByValue: { name: string; value: number }[];
  clientsByMonth:    { month: string; label: string; count: number }[];
}

export const EMPTY_RETENTION: RetentionData = {
  activeClients: 0, retainedLeads: 0, retentionRate: 0,
  avgClientValue: 0, topClientsByValue: [], clientsByMonth: [],
};

export async function getRetentionAnalytics(): Promise<RetentionData> {
  const [clients, invoices, leads] = await Promise.all([
    safe(getClients()), safe(getInvoices()), safe(getLeads()),
  ]);

  const clientValueMap: Record<string, number> = {};
  invoices.filter((i) => i.status === "paid").forEach((inv) => {
    clientValueMap[inv.client.name] = (clientValueMap[inv.client.name] ?? 0) + (inv.total ?? 0);
  });

  const retained = leads.filter((l) => l.stage === "retained").length;
  const total    = clients.length + retained;

  const now = new Date();
  const clientsByMonth: RetentionData["clientsByMonth"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthStr(d);
    clientsByMonth.push({
      month: key,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      count: clients.filter((c) => c.createdAt?.startsWith(key)).length,
    });
  }

  return {
    activeClients:     clients.length,
    retainedLeads:     retained,
    retentionRate:     total > 0 ? Math.round((retained / total) * 100) : 0,
    avgClientValue:    clients.length > 0 ? Math.round(Object.values(clientValueMap).reduce((s, v) => s + v, 0) / clients.length) : 0,
    topClientsByValue: Object.entries(clientValueMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    clientsByMonth,
  };
}
