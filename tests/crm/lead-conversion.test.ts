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

describe("Invariant #1 — converting a lead to a client must be one atomic event", () => {
  it("DEVIATION D1: if the lead update fails after the client doc is already created, the client is left permanently orphaned with no rollback", async () => {
    const { uid } = await signInAs("Sales Rep");
    const lead = await createLead(makeLead({ assignedTo: uid }));

    // Simulate a realistic race: something else (another tab, a cleanup
    // job, a duplicate-merge) deletes the lead between when this code read
    // it into memory and when convertToClient actually runs. The in-memory
    // `lead` object is now stale relative to Firestore.
    await deleteDocAsAdmin("leads", lead.id);

    await expect(convertToClient(lead, { uid, name: "Test Sales Rep" })).rejects.toThrow();

    // The client document is NOT rolled back — addDoc doesn't know or care
    // that the subsequent lead update is about to fail.
    const clients = await queryAsAdmin("clients", "leadId", lead.id);
    expect(clients).toHaveLength(1); // a client record now exists permanently...
    const leadStillGone = await readDocAsAdmin("leads", lead.id);
    expect(leadStillGone).toBeNull(); // ...with no corresponding "converted" lead at all — there is no trail back
  });

  it("the happy path (lead exists, nothing races it) does complete both writes correctly", async () => {
    const { uid } = await signInAs("Sales Rep");
    const lead = await createLead(makeLead({ assignedTo: uid }));

    const client = await convertToClient(lead, { uid, name: "Test Sales Rep" });
    expect(client.leadId).toBe(lead.id);

    const persistedLead = await readDocAsAdmin<Lead>("leads", lead.id);
    expect(persistedLead?.stage).toBe("client");
    expect(persistedLead?.clientId).toBe(client.id);
  });
});
