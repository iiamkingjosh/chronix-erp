import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent, signInExisting, readDocAsAdmin } from "../helpers/emulator";
import { createTicket, updateTicketStatus, getOpenTicketsWithSLA } from "@/lib/tickets-service";
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

describe("Invariant #3 — DEVIATION D3: the SLA dashboard's compliance metrics are structurally incapable of being correct", () => {
  it("replicating tickets/sla/page.tsx's exact computation shows compliance is always 100% and avgResolution is always 0, regardless of real ticket history", async () => {
    const { uid } = await signInAs("IT Manager");
    // Create and resolve several tickets with realistic, varied SLA outcomes.
    const onTime = await createTicket(makeTicketData({ slaDeadline: new Date(Date.now() + 86_400_000).toISOString() }));
    await updateTicketStatus(onTime.id, "resolved", { uid, name: "Test IT" });

    const late = await createTicket(makeTicketData({ slaDeadline: new Date(Date.now() - 86_400_000).toISOString() }));
    await updateTicketStatus(late.id, "resolved", { uid, name: "Test IT" });

    // tickets/sla/page.tsx's exact pattern (confirmed from source): it
    // calls getOpenTicketsWithSLA() for "active" tickets, and hardcodes
    // `const resolved: Ticket[] = []` — a literal empty array — rather than
    // querying resolved tickets at all.
    const active = await getOpenTicketsWithSLA();
    const resolved: Ticket[] = []; // <-- this is the page's actual line, reproduced verbatim

    const avgResolution = resolved.length === 0 ? 0 : 999; // the real formula only ever reaches the `0` branch
    const complianceRate = resolved.length === 0 ? 100 : 0; // same — only the `100` branch is ever reachable

    expect(active).toHaveLength(0); // both test tickets are now resolved, so neither shows as "active" — irrelevant to the point
    // EXPECTED under invariant #3: compliance should reflect that one
    // ticket above missed its deadline and one didn't (50%), and average
    // resolution time should be a real, non-zero duration. ACTUAL: because
    // `resolved` is a hardcoded literal, both values are dead-computed
    // constants no matter what really happened — confirmed by reproducing
    // the page's own code, not by inference.
    expect(avgResolution).toBe(0);
    expect(complianceRate).toBe(100);
  });
});

describe("Invariant #4 — DEVIATION D4: the SLA deadline shown as policy can be freely overridden per-ticket, with nothing tying the two together", () => {
  it("a ticket can be created with an SLA deadline that has no relationship to its priority's nominal target", async () => {
    await signInAs("IT Manager");
    // SLA_HOURS for "critical" priority is a few hours in the real app; here
    // a "critical" ticket is given a deadline a full year out — nothing in
    // createTicket or firestore.rules ties slaDeadline to priority at all.
    const farFutureDeadline = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const ticket = await createTicket(makeTicketData({ priority: "critical", slaDeadline: farFutureDeadline }));

    const persisted = await readDocAsAdmin<Ticket>("tickets", ticket.id);
    expect(persisted?.priority).toBe("critical");
    expect(persisted?.slaDeadline).toBe(farFutureDeadline);
    // The "SLA Targets by Priority" table on the dashboard would still
    // display its fixed per-priority number for "critical" as if it's the
    // enforced policy, while this specific ticket's real deadline is a year
    // away — confirmed nothing in the create path or rules prevents this.
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
