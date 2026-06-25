import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin } from "../helpers/emulator";
import { createIncident, updateIncidentStatus, closeIncidentWithRCA } from "@/lib/incident-service";
import { createChange, updateChangeStatus } from "@/lib/change-service";
import type { Incident } from "@/types/incident";
import type { ChangeEntry } from "@/types/change";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeIncidentData(overrides: Partial<Incident> = {}): Omit<Incident, "id"> {
  return {
    incidentRef: `INC-TEST-${Date.now()}`,
    title: "Test incident", description: "Something broke",
    severity: "P2", status: "investigating",
    affectedServices: "Test service",
    updates: [], detectedAt: new Date().toISOString(),
    incidentLead: "Test Lead", incidentLeadUid: "test-uid",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Omit<Incident, "id">;
}

const AUTHOR = { uid: "test-uid", name: "Test IT Manager", role: "IT Manager" };

describe("FIXED: DEVIATION D3 — closeIncidentWithRCA() now requires the incident to already be resolved", () => {
  it("updateIncidentStatus(...,\"resolved\") still sets resolvedAt but not closedAt/RCA fields", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData());
    await updateIncidentStatus(incident.id, "resolved", AUTHOR);

    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("resolved");
    expect(persisted?.resolvedAt).toBeDefined();
    expect((persisted as unknown as Record<string, unknown>)?.closedAt).toBeUndefined();
    expect((persisted as unknown as Record<string, unknown>)?.rootCause).toBeUndefined();
  });

  it("closeIncidentWithRCA() is genuinely rejected on an incident that was never marked resolved, not just hidden by the UI button", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData({ status: "investigating" }));

    // No call to updateIncidentStatus(...,"resolved") at all — attempting
    // to go straight from "investigating" to closed-with-RCA, the exact
    // call the UI's own button visibility has only ever prevented, now
    // also rejected at the function itself.
    await expect(
      closeIncidentWithRCA(incident.id, "Root cause text", "Actions taken text", "Prevention plan text", AUTHOR)
    ).rejects.toThrow(/must be resolved/i);

    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("investigating"); // unchanged - the write never happened
    expect((persisted as unknown as Record<string, unknown>)?.closedAt).toBeUndefined();
  });

  it("closing a resolved incident sets both closedAt and resolvedAt correctly, including the defensive fallback when resolvedAt was somehow already missing", async () => {
    await signInAs("IT Manager");
    // Seeded directly with status "resolved" but no resolvedAt - simulating
    // data that reached "resolved" through some path other than
    // updateIncidentStatus() (e.g. a future bug, a migration, manual data
    // entry). The defensive fallback must still produce a sensible record.
    const incident = await createIncident(makeIncidentData({ status: "resolved" }));

    await closeIncidentWithRCA(incident.id, "Root cause text", "Actions taken text", "Prevention plan text", AUTHOR);

    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("closed");
    expect(persisted?.closedAt).toBeDefined();
    expect(persisted?.resolvedAt).toBeDefined(); // backfilled by the defensive fallback
  });
});

describe("FIXED: DEVIATION D4 — updateIncidentStatus/closeIncidentWithRCA/updateChangeStatus now log audit_logs themselves", () => {
  it("updateIncidentStatus() produces exactly one audit_logs entry with the correct author", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData());
    await updateIncidentStatus(incident.id, "resolved", AUTHOR);

    const entries = await queryAsAdmin<{ actorUid: string; actorName: string; module: string; action: string }>("audit_logs", "entityId", incident.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].actorUid).toBe(AUTHOR.uid);
    expect(entries[0].actorName).toBe(AUTHOR.name);
    expect(entries[0].module).toBe("incidents");
  });

  it("closeIncidentWithRCA() produces exactly one audit_logs entry, action \"resolve\"", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData({ status: "resolved" }));
    await closeIncidentWithRCA(incident.id, "Root cause text", "Actions taken text", "Prevention plan text", AUTHOR);

    const entries = await queryAsAdmin<{ action: string }>("audit_logs", "entityId", incident.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("resolve");
  });

  it("updateChangeStatus() now produces a genuine audit_logs entry with the correct author - it produced zero before", async () => {
    await signInAs("IT Manager");
    const change = await createChange({
      changeRef: `CHG-TEST-${Date.now()}`, title: "Test change", description: "test",
      type: "standard", risk: "low", status: "draft",
      requestedBy: "Test Requester", requestedByUid: "test-uid",
      affectedSystems: "Test system", rollbackPlan: "Test rollback plan",
      createdAt: new Date().toISOString(),
    } as unknown as Omit<ChangeEntry, "id">);
    await updateChangeStatus(change.id, "approved", AUTHOR);

    const entries = await queryAsAdmin<{ actorUid: string; module: string }>("audit_logs", "entityId", change.id);
    expect(entries).toHaveLength(1); // zero before this fix - confirmed via this exact assertion this morning
    expect(entries[0].actorUid).toBe(AUTHOR.uid);
    expect(entries[0].module).toBe("changes");
  });
});
