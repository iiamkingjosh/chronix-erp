import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, seedDoc } from "../helpers/emulator";
import { getSalesAnalytics, getTeamAnalytics, clearAnalyticsCache, LOW_SAMPLE_THRESHOLD } from "@/lib/analytics-service";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
  clearAnalyticsCache();
});
afterAll(async () => {
  await teardownEmulators();
});

function seedInvoice(id: string, overrides: Record<string, unknown> = {}) {
  return seedDoc("invoices", id, {
    invoiceNumber: id, invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10), status: "paid",
    client: { name: "Test Client", address: "x", phone: "x" },
    salesperson: "Test", items: [], subtotal: 1000, vatRate: 0, vatAmount: 0, total: 1000,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

function seedLead(id: string, overrides: Record<string, unknown> = {}) {
  return seedDoc("leads", id, {
    leadId: id, fullName: "Test Lead", company: "Test Co", email: "x@test.local", phone: "x",
    source: "referral", stage: "new", assignedTo: "x", assignedName: "x", notes: "",
    activity: [], followUps: [], createdAt: new Date().toISOString(), createdBy: "x", updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

function seedProject(id: string, overrides: Record<string, unknown> = {}) {
  return seedDoc("projects", id, {
    projectId: id, name: "Test Project", clientName: "Test Client", type: "retainer",
    description: "x", status: "in_progress", team: [], startDate: new Date().toISOString().slice(0, 10),
    deadline: new Date().toISOString().slice(0, 10), milestones: [], tasks: [], activity: [],
    progress: 0, createdAt: new Date().toISOString(), createdBy: "x", updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

function seedTicket(id: string, overrides: Record<string, unknown> = {}) {
  return seedDoc("tickets", id, {
    ticketId: id, client: { name: "Test Client", contact: "x" }, title: "Test issue",
    description: "x", priority: "medium", status: "open", assignedTo: "staff-1", assignedName: "Test Staff",
    slaDeadline: new Date(Date.now() + 86_400_000).toISOString(), notes: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

describe("Analytics: denied (permission-rejected) vs genuinely-empty distinction", () => {
  it("Brand Lead is denied on invoices but still sees real lead data — not a misleading zero", async () => {
    await signInAs("Brand Lead");
    await seedInvoice("inv-1");
    await seedLead("lead-1", { stage: "client", convertedAt: new Date().toISOString() });

    const data = await getSalesAnalytics();

    expect(data.deniedSources).toContain("invoices");
    expect(data.deniedSources).not.toContain("leads");
    expect(data.dealsClosedThisMonth).toBe(0);
    expect(data.pipelineValue).toBe(0);
    // Real, accessible lead data still comes through despite the invoices denial.
    expect(data.totalLeads).toBe(1);
    expect(data.convertedLeads).toBe(1);
  });

  it("HR is denied on projects but still sees real ticket data — not a misleading zero", async () => {
    await signInAs("HR");
    await seedProject("proj-1");
    await seedTicket("tkt-1");

    const data = await getTeamAnalytics();

    expect(data.deniedSources).toContain("projects");
    expect(data.deniedSources).not.toContain("tickets");
    expect(data.tasksCompleted).toEqual([]);
    expect(data.totalProjects).toBe(0);
    // Real, accessible ticket data still comes through despite the projects denial.
    expect(data.openTicketsPerStaff).toEqual([{ name: "Test Staff", count: 1 }]);
  });

  it("a role with genuine access and genuinely no data sees a real empty state, not a denial", async () => {
    await signInAs("CFO");

    const data = await getSalesAnalytics();

    expect(data.deniedSources).toEqual([]);
    expect(data.totalLeads).toBe(0);
    expect(data.dealsClosedThisMonth).toBe(0);
  });
});

describe("Analytics: low-sample-size caveat on rate metrics", () => {
  it("the real-world 1-of-1 Lead Conversion Rate case is flagged as a low sample", async () => {
    await signInAs("CFO");
    await seedLead("lead-1", { stage: "client", convertedAt: new Date().toISOString() });

    const data = await getSalesAnalytics();

    expect(data.totalLeads).toBe(1);
    expect(data.convertedLeads).toBe(1);
    expect(data.leadConversionRate).toBe(100);
    expect(data.totalLeads).toBeLessThan(LOW_SAMPLE_THRESHOLD);
  });

  it("a genuinely large sample is NOT flagged as low", async () => {
    await signInAs("CFO");
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        seedLead(`lead-${i}`, i < 4 ? { stage: "client", convertedAt: new Date().toISOString() } : { stage: "new" })
      )
    );

    const data = await getSalesAnalytics();

    expect(data.totalLeads).toBe(12);
    expect(data.convertedLeads).toBe(4);
    expect(data.totalLeads).toBeGreaterThanOrEqual(LOW_SAMPLE_THRESHOLD);
  });
});
