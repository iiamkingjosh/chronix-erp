import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent, readDocAsAdmin } from "../helpers/emulator";
import { createLeaveRequest, cancelLeave, reviewLeave } from "@/lib/leave-service";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { LeaveRequest } from "@/types/leave";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
  await signOutCurrent();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("DEVIATION D7 — Executive Assistant's UI shows a \"Create Review\" button that firestore.rules will always reject", () => {
  it("a direct performance_reviews write (mirroring CreateReviewModal.handleSave) is rejected for Executive Assistant", async () => {
    await signInAs("Executive Assistant");
    // performance_reviews write rule: canManageHR() || isCEO() — EA has
    // neither, despite the performance page's own UI gate being
    // `manage:hr || view:all`, and EA holds view:all by design.
    await expect(
      addDoc(collection(db, "performance_reviews"), {
        employeeId: "someone",
        reviewPeriod: "2026-Q2",
        kpiScores: { taskCompletionRate: 80, ticketResolutionRate: 80, attendancePunctuality: 80, qualityOfWork: 80, communicationTeamwork: 80, initiativeProblemSolving: 80 },
        overallScore: 80,
        entitlement: "Above Target",
        comments: "test",
        createdBy: "ea-uid",
        createdByName: "Test EA",
        createdAt: new Date().toISOString(),
      })
    ).rejects.toThrow(/permission/i);
  });

  it("the identical write succeeds for HR (the role the rule actually intends)", async () => {
    await signInAs("HR");
    await expect(
      addDoc(collection(db, "performance_reviews"), {
        employeeId: "someone",
        reviewPeriod: "2026-Q2",
        kpiScores: { taskCompletionRate: 80, ticketResolutionRate: 80, attendancePunctuality: 80, qualityOfWork: 80, communicationTeamwork: 80, initiativeProblemSolving: 80 },
        overallScore: 80,
        entitlement: "Above Target",
        comments: "test",
        createdBy: "hr-uid",
        createdByName: "Test HR",
        createdAt: new Date().toISOString(),
      })
    ).resolves.toBeDefined();
  });
});

function makeLeave(uid: string, overrides: Partial<LeaveRequest> = {}): Omit<LeaveRequest, "id"> {
  return {
    employeeUid: uid,
    employeeName: "Test Employee",
    employeeEmail: "test-employee@test.local",
    leaveType: "annual",
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    days: 5,
    reason: "Vacation",
    status: "pending",
    submittedAt: new Date().toISOString(),
    ...overrides,
  } as Omit<LeaveRequest, "id">;
}

describe("Invariant #6 — a leave action must be available to exactly the roles the permission model says, consistently", () => {
  it("the employee who submitted a pending leave request can cancel it themselves", async () => {
    const { uid } = await signInAs("Staff");
    const leave = await createLeaveRequest(makeLeave(uid));
    await expect(cancelLeave(leave.id)).resolves.toBeUndefined();

    const persisted = await readDocAsAdmin<LeaveRequest>("leave_requests", leave.id);
    expect(persisted?.status).toBe("cancelled");
  });

  it("DEVIATION D8 boundary check: a different, non-manager Staff member cannot cancel someone else's leave request", async () => {
    const { uid: ownerUid } = await signInAs("Staff");
    const leave = await createLeaveRequest(makeLeave(ownerUid));
    await signOutCurrent();

    await signInAs("Staff"); // a different Staff account, not the owner, not a manager
    await expect(cancelLeave(leave.id)).rejects.toThrow(/permission/i);
  });

  it("HR can review (approve) any pending leave request", async () => {
    const { uid: ownerUid } = await signInAs("Staff");
    const leave = await createLeaveRequest(makeLeave(ownerUid));
    await signOutCurrent();

    await signInAs("HR");
    await expect(reviewLeave(leave.id, "approved", "Test HR")).resolves.toBeUndefined();

    const persisted = await readDocAsAdmin<LeaveRequest>("leave_requests", leave.id);
    expect(persisted?.status).toBe("approved");
  });

  it("a non-HR, non-CEO role (e.g. a different Staff member) cannot review someone else's leave request", async () => {
    const { uid: ownerUid } = await signInAs("Staff");
    const leave = await createLeaveRequest(makeLeave(ownerUid));
    await signOutCurrent();

    await signInAs("Staff");
    await expect(reviewLeave(leave.id, "approved", "Random Staff")).rejects.toThrow(/permission/i);
  });
});
