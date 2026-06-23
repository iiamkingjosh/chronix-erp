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

describe("Invariant #3 — DEVIATION D3: an incident reaches \"over\" via two mechanisms that write different field sets", () => {
  it("updateIncidentStatus(...,\"resolved\") sets resolvedAt but not closedAt/RCA fields", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData());
    await updateIncidentStatus(incident.id, "resolved");

    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("resolved");
    expect(persisted?.resolvedAt).toBeDefined();
    expect((persisted as unknown as Record<string, unknown>)?.closedAt).toBeUndefined();
    expect((persisted as unknown as Record<string, unknown>)?.rootCause).toBeUndefined();
  });

  it("closeIncidentWithRCA can be called directly on an incident that was NEVER marked resolved, skipping that state entirely", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData({ status: "investigating" }));

    // No call to updateIncidentStatus(...,"resolved") at all — going
    // straight from "investigating" to closed-with-RCA.
    await closeIncidentWithRCA(incident.id, "Root cause text", "Actions taken text", "Prevention plan text");

    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("closed");
    expect((persisted as unknown as Record<string, unknown>)?.resolvedAt).toBeUndefined();
    // EXPECTED if "closed" implies "passed through resolved" (a reasonable
    // assumption for any future MTTR report): resolvedAt should exist.
    // ACTUAL: an incident can be closed having never been marked resolved
    // at all — confirmed directly, not inferred.
  });
});

describe("DEVIATION D4 — audit logging is entirely the CALLER's responsibility; neither service function enforces it itself", () => {
  it("neither updateIncidentStatus nor updateChangeStatus writes to audit_logs on their own — confirming the inconsistency in the inventory (incidents logged, changes not) is a property of which PAGE calls logAuditEvent afterward, not of the data layer", async () => {
    await signInAs("IT Manager");
    const incident = await createIncident(makeIncidentData());
    await updateIncidentStatus(incident.id, "resolved");
    const incidentAuditEntries = await queryAsAdmin("audit_logs", "entityId", incident.id);
    expect(incidentAuditEntries).toHaveLength(0); // the SERVICE function itself never logs — incidents/[id]/page.tsx is what adds the audit call afterward

    const change = await createChange({
      changeRef: `CHG-TEST-${Date.now()}`, title: "Test change", description: "test",
      type: "standard", risk: "low", status: "draft",
      requestedBy: "Test Requester", requestedByUid: "test-uid",
      affectedSystems: "Test system", rollbackPlan: "Test rollback plan",
      createdAt: new Date().toISOString(),
    } as unknown as Omit<ChangeEntry, "id">);
    await updateChangeStatus(change.id, "approved", "Test IT Manager");
    const changeAuditEntries = await queryAsAdmin("audit_logs", "entityId", change.id);
    expect(changeAuditEntries).toHaveLength(0);

    // Confirms WHY the inventory's observed inconsistency (incident status
    // changes audit-logged, change status changes not) exists at all: audit
    // logging isn't enforced anywhere near the data layer for either
    // resource — it depends entirely on whether the calling UI component
    // remembered to add a separate logAuditEvent() call. Nothing here
    // would catch a future regression if incidents/[id]/page.tsx's audit
    // call were ever accidentally removed, either.
  });
});
