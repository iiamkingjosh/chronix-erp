import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, seedDoc } from "../helpers/emulator";
import { createEmployee, suspendEmployee, activateEmployee } from "@/lib/hr-service";
import type { Employee } from "@/types/hr";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeEmployeeData(uid: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id: uid,
    uid,
    fullName: "Test Employee",
    email: "employee@test.local",
    phone: "+2348000000000",
    role: "Staff",
    department: "Engineering",
    salary: 300_000,
    bankName: "Test Bank",
    accountNumber: "1234567890",
    accountName: "Test Employee",
    dateJoined: new Date().toISOString().split("T")[0],
    status: "active",
    nextOfKin: { name: "Next Kin", relationship: "Spouse", phone: "+2348000000001" },
    notes: "",
    performanceNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("NEW FINDING — createEmployee silently breaks for HR because counters/employeeNumber has no firestore.rules entry at all", () => {
  it("HR can write the HR fields onto users/{uid}, but the employee-number assignment transaction is rejected by the Root-Admin-only catch-all rule", async () => {
    await signInAs("HR");
    const targetUid = "employee-" + Date.now();
    // Realistic precondition: HR's "Add Employee" flow only links an
    // EXISTING user account (the dropdown explicitly says "Select existing
    // user account…") — the target always self-registered first, so their
    // users/{uid} doc already exists. Seeding that here so createEmployee's
    // setDoc is a genuine `update` under firestore.rules, not a `create`
    // (which would be rejected for an unrelated reason: the create rule
    // only allows self-uid bootstrap).
    await seedDoc("users", targetUid, { uid: targetUid, role: "Staff", email: "x@test.local", createdAt: new Date().toISOString() });

    // firestore.rules has no `/counters/{id}` match block anywhere. Every
    // write that doesn't match an earlier rule falls through to the final
    // catch-all: `match /{document=**} { allow read, write: if isAuth() &&
    // isRootAdmin(); }`. assignEmployeeNumber()'s transaction writes BOTH
    // counters/employeeNumber AND users/{uid} atomically — if either write
    // is rejected, Firestore rejects the whole transaction.
    //
    // EXPECTED under invariant #5 (HR can manage employee records): this
    // should succeed end-to-end for HR, since creating an employee record
    // (including assigning their number) is HR's primary job.
    // ACTUAL: it throws, because HR is not Root Admin.
    await expect(createEmployee(makeEmployeeData(targetUid))).rejects.toThrow(/permission/i);

    // Confirming the partial-failure shape: the earlier setDoc (HR fields
    // merged onto the user doc) happens BEFORE the transaction in
    // createEmployee's own code, as a separate, unguarded write — so it is
    // NOT atomic with the number assignment. Check what state that leaves.
    const persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.bankName).toBe("Test Bank"); // the HR fields DID get written...
    expect(persisted?.employeeNumber).toBeUndefined(); // ...but no employee number was ever assigned, and createEmployee threw
  });

  it("the identical flow succeeds end-to-end for Root Admin (confirming the gap is role-specific, not universal)", async () => {
    await signInAs("Root Admin");
    const targetUid = "employee-root-" + Date.now();

    const empNumber = await createEmployee(makeEmployeeData(targetUid));
    expect(empNumber).toMatch(/^CTL\d{3}$/);

    const persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.employeeNumber).toBe(empNumber);
  });
});

describe("DEVIATION D5 — the legacy `employees` collection is never written by the live HR code path", () => {
  it("createEmployee (Root Admin, so it succeeds end-to-end) writes only to `users`, never to `employees`", async () => {
    await signInAs("Root Admin");
    const targetUid = "employee-legacy-check-" + Date.now();
    await createEmployee(makeEmployeeData(targetUid));

    const legacyDoc = await readDocAsAdmin("employees", targetUid);
    expect(legacyDoc).toBeNull(); // confirms `employees/{uid}` was never touched, even though firestore.rules still declares rules for it
  });
});

describe("Invariant #5 — suspend/activate must be available to the role whose job it is (HR), consistently", () => {
  it("HR can suspend and reactivate an employee (the users/{uid} status field, which works fine on its own)", async () => {
    await signInAs("HR");
    const targetUid = "suspend-target-" + Date.now();
    await seedDoc("users", targetUid, { uid: targetUid, role: "Staff", status: "active", email: "x@test.local" });

    await suspendEmployee(targetUid);
    let persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.status).toBe("suspended");

    await activateEmployee(targetUid);
    persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.status).toBe("active");
  });
});
