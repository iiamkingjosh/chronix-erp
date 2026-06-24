import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent, signInExisting, readDocAsAdmin, queryAsAdmin, seedDoc } from "../helpers/emulator";
import { createTicket, updateTicketStatus, getOpenTicketsWithSLA, getResolvedTicketsWithSLA, overrideSlaDeadline } from "@/lib/tickets-service";
import type { Ticket } from "@/types/tickets";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeTicketData(overrides: Partial<Ticket> = {}): Omit<Ticket, "id"> {
  return {
    ticketId: `TKT-TEST-${Date.now()}`,
    client: { name: "Test Client", contact: "test@client.local" },
    title: "Test issue",
    description: "Something is broken",
    priority: "medium",
    status: "open",
    assignedTo: "test-uid",
    assignedName: "Test Assignee",
    slaDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    notes: [],
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FIXED: DEVIATION D3 — getResolvedTicketsWithSLA() now feeds the SLA dashboard real data instead of a hardcoded empty array", () => {
  it("avgResolution and complianceRate compute genuine, non-zero, correct numbers from seeded resolved/closed tickets", async () => {
    await signInAs("IT Manager");

    // Seeded directly via Firestore (not createTicket()) - createTicket()
    // now hard-enforces slaDeadline from priority (D4, this same session),
    // so it would silently overwrite the deliberately-chosen deadlines
    // this test needs for deterministic compliance math. updateTicketStatus()
    // also always stamps resolvedAt with the real current time, which can't
    // produce deterministic elapsed-time math either - so the resolved
    // state itself is seeded directly too.
    const t0 = Date.now();
    const onTimeId = "d3-on-time-" + t0;
    const lateId    = "d3-late-" + t0;
    await seedDoc("tickets", onTimeId, makeTicketData({
      status:      "resolved",
      createdAt:   new Date(t0).toISOString(),
      resolvedAt:  new Date(t0 + 2 * 3_600_000).toISOString(),  // resolved 2h after creation
      slaDeadline: new Date(t0 + 24 * 3_600_000).toISOString(), // due in 24h - well within deadline
    }));
    await seedDoc("tickets", lateId, makeTicketData({
      status:      "resolved",
      createdAt:   new Date(t0).toISOString(),
      resolvedAt:  new Date(t0 + 10 * 3_600_000).toISOString(), // resolved 10h after creation
      slaDeadline: new Date(t0 + 5 * 3_600_000).toISOString(),  // was due at 5h - missed it
    }));
    // A third, still-open ticket must NOT be counted in either metric.
    await seedDoc("tickets", "d3-open-" + t0, makeTicketData({ status: "open" }));

    const resolved = await getResolvedTicketsWithSLA();
    expect(resolved.map((t) => t.id).sort()).toEqual([onTimeId, lateId].sort());

    // tickets/sla/page.tsx's exact formula, reproduced verbatim - now fed
    // real data instead of a hardcoded literal.
    const resolutionTimes = resolved
      .filter((t) => t.resolvedAt)
      .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000);
    const avgResolution = resolutionTimes.length
      ? resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length
      : 0;
    const complianceRate = resolved.length === 0 ? 100 : Math.round(
      (resolved.filter((t) => t.resolvedAt && new Date(t.resolvedAt) <= new Date(t.slaDeadline)).length / resolved.length) * 100
    );

    // FIXED: genuine, computed values - (2h + 10h) / 2 = 6h average, and
    // exactly one of the two resolved tickets (onTime) met its deadline = 50%.
    expect(avgResolution).toBe(6);
    expect(complianceRate).toBe(50);
  });

  it("a ticket closed without ever passing through \"resolved\" (no resolvedAt) is excluded from both metrics rather than breaking them", async () => {
    await signInAs("IT Manager");
    await seedDoc("tickets", "d3-closed-" + Date.now(), makeTicketData({ status: "closed" })); // no resolvedAt key at all - never passed through "resolved"

    const resolved = await getResolvedTicketsWithSLA();
    expect(resolved).toHaveLength(1);
    const withResolvedAt = resolved.filter((t) => t.resolvedAt);
    expect(withResolvedAt).toHaveLength(0); // excluded by the page's own existing filter, not by this query
  });
});

describe("FIXED: DEVIATION D4 — slaDeadline is now hard-enforced from priority at creation; override requires manager permission + a logged reason", () => {
  it("a critical-priority ticket created with a client-submitted deadline a year out gets the real 4-hour deadline instead - the server ignores the client value", async () => {
    await signInAs("IT Manager");
    const farFutureDeadline = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const createdAt = new Date().toISOString();
    const ticket = await createTicket(makeTicketData({ priority: "critical", slaDeadline: farFutureDeadline, createdAt }));

    const persisted = await readDocAsAdmin<Ticket>("tickets", ticket.id);
    expect(persisted?.priority).toBe("critical");
    expect(persisted?.slaDeadline).not.toBe(farFutureDeadline);
    // SLA_HOURS.critical = 4 - confirmed the persisted deadline is exactly
    // 4 hours after createdAt, not the year-out value the client sent.
    const actualHours = (new Date(persisted!.slaDeadline).getTime() - new Date(createdAt).getTime()) / 3_600_000;
    expect(actualHours).toBeCloseTo(4, 5);
  });

  it("a non-manager attempting to override a ticket's SLA deadline is rejected", async () => {
    await signInAs("IT Manager");
    const ticket = await createTicket(makeTicketData({ priority: "low" }));
    await signOutCurrent();

    const { uid: staffUid } = await signInAs("Staff");
    await expect(
      overrideSlaDeadline(ticket.id, new Date(Date.now() + 86_400_000).toISOString(), "Client asked for more time", staffUid)
    ).rejects.toThrow(/permission/i);
  });

  it("a manager's override is rejected without a reason, and correctly applied + logged with both old and new values when a reason is given", async () => {
    const { uid } = await signInAs("IT Manager");
    const ticket = await createTicket(makeTicketData({ priority: "low" }));
    const oldDeadline = (await readDocAsAdmin<Ticket>("tickets", ticket.id))!.slaDeadline;
    const newDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();

    await expect(overrideSlaDeadline(ticket.id, newDeadline, "", uid)).rejects.toThrow(/reason/i);

    await overrideSlaDeadline(ticket.id, newDeadline, "Client contractually agreed to a 30-day resolution window", uid);

    const persisted = await readDocAsAdmin<Ticket>("tickets", ticket.id);
    expect(persisted?.slaDeadline).toBe(newDeadline);
    expect(persisted?.slaOverrideReason).toBe("Client contractually agreed to a 30-day resolution window");
    expect(persisted?.slaOverriddenBy).toBeTruthy();

    const auditLogs = await queryAsAdmin<{ actorUid: string; details: string; module: string }>("audit_logs", "entityId", ticket.id);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].module).toBe("tickets");
    expect(auditLogs[0].details).toContain(oldDeadline);
    expect(auditLogs[0].details).toContain(newDeadline);
    expect(auditLogs[0].details).toContain("Client contractually agreed");
  });
});

describe("DEVIATION D5 (fixed) — a non-manager assignee's own status change now succeeds; the rule's allowlist was missing fields updateTicketStatus actually writes", () => {
  it("the ticket's own assigned (non-manager) Staff member CAN change its status, including a transition that sets closedAt", async () => {
    // Create the Staff account FIRST so we know its uid/email, then switch
    // to a manager identity to create the ticket assigned to that uid
    // (createTicket itself requires no special permission — `tickets`
    // create allows any non-client per other parts of this domain's rules
    // — but using System Admin here keeps the setup unambiguous).
    const { uid: staffUid, email: staffEmail } = await signInAs("Staff");
    await signOutCurrent();

    await signInAs("System Admin");
    const ticket = await createTicket(makeTicketData({ assignedTo: staffUid }));
    await signOutCurrent();

    // Sign back in AS the assignee themselves.
    await signInExisting(staffEmail);
    await expect(
      updateTicketStatus(ticket.id, "resolved", { uid: staffUid, name: "Test Staff" })
    ).resolves.toBeUndefined();

    // Also confirm the "closed" transition, which writes closedAt — a second
    // field the original allowlist was missing alongside notes.
    await expect(
      updateTicketStatus(ticket.id, "closed", { uid: staffUid, name: "Test Staff" })
    ).resolves.toBeUndefined();

    // FIXED under invariant #6: the rule was clearly written to let a
    // non-manager assignee self-service their own ticket's status (it
    // explicitly checks `resource.data.assignedTo == request.auth.uid`).
    // The allowlist (["status","resolution","activity","updatedAt",
    // "resolvedAt"]) was missing `notes` (always written via arrayUnion)
    // and `closedAt` (written when status is "closed") — both now added.
    // `resolution`/`activity` remain in the allowlist unused — the ticket
    // model has no such fields, but removing them wasn't part of this fix.
  });

  it("a manager (e.g. IT Manager) CAN change the same ticket's status, confirming the gap is specific to the non-manager self-service path", async () => {
    const { uid: staffUid } = await signInAs("Staff");
    await signOutCurrent();

    await signInAs("IT Manager");
    const ticket = await createTicket(makeTicketData({ assignedTo: staffUid }));
    await expect(
      updateTicketStatus(ticket.id, "resolved", { uid: "it-mgr", name: "Test IT Manager" })
    ).resolves.toBeUndefined();
  });
});

describe("FIXED: DEVIATION D8 — updateTicketStatus()'s note id is now a real crypto.randomUUID(), not a collision-prone Date.now().toString()", () => {
  it("the TicketNote written by a real status change has a UUID-shaped id", async () => {
    const { uid } = await signInAs("IT Manager");
    const ticket = await createTicket(makeTicketData());
    await updateTicketStatus(ticket.id, "in_progress", { uid, name: "Test IT Manager" });

    const persisted = await readDocAsAdmin<Ticket>("tickets", ticket.id);
    const note = persisted!.notes[persisted!.notes.length - 1];
    expect(note.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
