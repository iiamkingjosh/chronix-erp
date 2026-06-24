import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin, deleteDocAsAdmin } from "../helpers/emulator";
import { createLead, convertToClient } from "@/lib/crm-service";
import type { Lead } from "@/types/crm";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeLead(overrides: Partial<Lead> = {}): Omit<Lead, "id"> {
  return {
    leadId: `LDR-TEST-${Date.now()}`,
    fullName: "Test Lead",
    company: "Test Co",
    email: "lead@test.local",
    phone: "+2348000000000",
    source: "manual",
    stage: "prospect",
    assignedTo: "test-uid",
    assignedName: "Test Sales Rep",
    notes: "",
    activity: [],
    followUps: [],
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FIXED: Invariant #1 — converting a lead to a client is now one atomic transaction", () => {
  it("DEVIATION D1 (fixed): if the lead is deleted before the transaction starts, it throws cleanly and leaves NO orphaned client behind", async () => {
    const { uid } = await signInAs("Sales Rep");
    const lead = await createLead(makeLead({ assignedTo: uid }));

    // Simulate a realistic race: something else (another tab, a cleanup
    // job, a duplicate-merge) deletes the lead between when this code read
    // it into memory and when convertToClient actually runs. The in-memory
    // `lead` object is now stale relative to Firestore.
    await deleteDocAsAdmin("leads", lead.id);

    await expect(convertToClient(lead, { uid, name: "Test Sales Rep" })).rejects.toThrow(/no longer exists/i);

    // FIXED: re-read production-shape data after the failed attempt - the
    // transaction's fresh tx.get(leadRef) saw the lead was gone and threw
    // BEFORE either tx.set()/tx.update() was ever applied, so neither
    // write took effect. No orphaned client, confirmed directly.
    const clients = await queryAsAdmin("clients", "leadId", lead.id);
    expect(clients).toHaveLength(0);
    const leadStillGone = await readDocAsAdmin("leads", lead.id);
    expect(leadStillGone).toBeNull();
  });

  it("DEVIATION D1 (fixed): two concurrent conversion attempts on the same lead - exactly one succeeds, the second is cleanly rejected, no duplicate client", async () => {
    const { uid: repAUid } = await signInAs("Sales Rep");
    const lead = await createLead(makeLead({ assignedTo: repAUid }));

    // Both calls start from the SAME in-memory lead snapshot (stage still
    // "prospect"), genuinely concurrent - neither has seen the other's
    // result yet when both transactions begin.
    const results = await Promise.allSettled([
      convertToClient(lead, { uid: repAUid, name: "Rep A" }),
      convertToClient(lead, { uid: repAUid, name: "Rep B" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected   = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already been converted/i);

    // Exactly one client document exists - the idempotency guard (fresh
    // read of stage inside the transaction) stopped the loser before it
    // ever created a second one.
    const clients = await queryAsAdmin("clients", "leadId", lead.id);
    expect(clients).toHaveLength(1);

    const persistedLead = await readDocAsAdmin<Lead>("leads", lead.id);
    expect(persistedLead?.stage).toBe("client");
  });

  it("the happy path (lead exists, nothing races it) still completes both writes correctly", async () => {
    const { uid } = await signInAs("Sales Rep");
    const lead = await createLead(makeLead({ assignedTo: uid }));

    const client = await convertToClient(lead, { uid, name: "Test Sales Rep" });
    expect(client.leadId).toBe(lead.id);

    const persistedLead = await readDocAsAdmin<Lead>("leads", lead.id);
    expect(persistedLead?.stage).toBe("client");
    expect(persistedLead?.clientId).toBe(client.id);
  });
});
