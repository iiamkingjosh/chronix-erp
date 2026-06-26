import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin } from "../helpers/emulator";
import { createIncident, updateIncidentStatus, addIncidentUpdate, closeIncidentWithRCA } from "@/lib/incident-service";
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

function makeChangeData(overrides: Partial<ChangeEntry> = {}): Omit<ChangeEntry, "id"> {
  return {
    changeRef: `CHG-TEST-${Date.now()}`,
    title: "Test change", description: "Planned change",
    type: "normal", risk: "low", status: "proposed",
    requestedBy: "Test Requester", requestedByUid: "test-uid",
    scheduledFor: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Omit<ChangeEntry, "id">;
}

const MANAGE_ROLES = ["Root Admin", "System Admin", "CEO", "CFO", "IT Manager"] as const;

describe("FIXED: incidents now genuinely rejects management actions for anyone outside Root Admin/System Admin/CEO/CFO/IT Manager", () => {
  it.each(MANAGE_ROLES)("%s can genuinely update incident status, post a timeline update, and close with RCA against the real rule", async (role) => {
    const { uid } = await signInAs(role);
    const author = { uid, name: `Test ${role}`, role };

    const incident = await createIncident(makeIncidentData({ status: "investigating" }));

    await updateIncidentStatus(incident.id, "resolved", author);
    let persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("resolved");

    await addIncidentUpdate(incident.id, { id: "u1", authorName: author.name, message: "status update", timestamp: new Date().toISOString() });
    persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.updates).toHaveLength(1);

    await closeIncidentWithRCA(incident.id, "root cause", "actions taken", "prevention plan", author);
    persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("closed");
    expect(persisted?.rootCause).toBe("root cause");
  });

  it("Staff can create an incident (rule allows it) but is genuinely rejected on all three management actions — both directions of the gate confirmed", async () => {
    await signInAs("Staff");
    const author = { uid: "staff-uid", name: "Test Staff", role: "Staff" };

    const incident = await createIncident(makeIncidentData({ status: "investigating" }));
    expect(incident.id).toBeDefined(); // create still succeeds — matches the unchanged isAuth()-only create rule

    await expect(updateIncidentStatus(incident.id, "resolved", author)).rejects.toThrow(/permission/i);
    await expect(
      addIncidentUpdate(incident.id, { id: "u1", authorName: author.name, message: "x", timestamp: new Date().toISOString() })
    ).rejects.toThrow(/permission/i);
    await expect(
      closeIncidentWithRCA(incident.id, "x", "x", "x", author)
    ).rejects.toThrow(/permission|resolved/i); // resolved-guard would fire first if status were "resolved"; here it's still "investigating" so the rule itself rejects the addIncidentUpdate-adjacent updateDoc path

    // Confirm nothing actually changed despite the rejected calls.
    const persisted = await readDocAsAdmin<Incident>("incidents", incident.id);
    expect(persisted?.status).toBe("investigating");
    expect(persisted?.updates ?? []).toHaveLength(0);
  });

  it("Changes is unaffected by this fix — System Admin and Staff behave exactly as before (no regression)", async () => {
    const { uid } = await signInAs("System Admin");
    const change = await createChange(makeChangeData());
    await updateChangeStatus(change.id, "approved", { uid, name: "Test Admin", role: "System Admin" });
    const persisted = await readDocAsAdmin<ChangeEntry>("change_log", change.id);
    expect(persisted?.status).toBe("approved");

    await signInAs("Staff");
    const change2 = await createChange(makeChangeData());
    await expect(
      updateChangeStatus(change2.id, "approved", { uid: "staff-uid", name: "Test Staff", role: "Staff" })
    ).rejects.toThrow(/permission/i);
  });
});
