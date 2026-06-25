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

describe("FIXED: createEmployee now succeeds end-to-end for HR — counters/employeeNumber finally has a real firestore.rules entry", () => {
  it("HR creates an employee and a real, sequential employee number is genuinely assigned and persisted — not just 'the rule no longer rejects'", async () => {
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

    const empNumber = await createEmployee(makeEmployeeData(targetUid));
    expect(empNumber).toMatch(/^CTL\d{3}$/);

    // Full end-to-end verification, not just "no error thrown": the HR
    // fields AND the employee number are both genuinely persisted on the
    // real document, confirming the transaction's two writes
    // (counters/employeeNumber + users/{uid}) both actually landed.
    const persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.bankName).toBe("Test Bank");
    expect(persisted?.employeeNumber).toBe(empNumber);

    const counterDoc = await readDocAsAdmin<{ lastAssigned: number }>("counters", "employeeNumber");
    expect(counterDoc?.lastAssigned).toBeGreaterThanOrEqual(3); // CTL001/002 reserved, so the real counter starts at 3
  });

  it("two HR-created employees in sequence get two distinct, incrementing numbers — confirms the counter transaction itself works, not just a single lucky write", async () => {
    await signInAs("HR");
    const uid1 = "employee-seq-1-" + Date.now();
    const uid2 = "employee-seq-2-" + Date.now();
    await seedDoc("users", uid1, { uid: uid1, role: "Staff", email: "x1@test.local", createdAt: new Date().toISOString() });
    await seedDoc("users", uid2, { uid: uid2, role: "Staff", email: "x2@test.local", createdAt: new Date().toISOString() });

    const num1 = await createEmployee(makeEmployeeData(uid1));
    const num2 = await createEmployee(makeEmployeeData(uid2));

    expect(num1).not.toBe(num2);
    const n1 = Number(num1.replace("CTL", ""));
    const n2 = Number(num2.replace("CTL", ""));
    expect(n2).toBe(n1 + 1);
  });

  it("the identical flow still succeeds end-to-end for Root Admin (confirming the fix didn't narrow access, only widened it to HR)", async () => {
    await signInAs("Root Admin");
    const targetUid = "employee-root-" + Date.now();

    const empNumber = await createEmployee(makeEmployeeData(targetUid));
    expect(empNumber).toMatch(/^CTL\d{3}$/);

    const persisted = await readDocAsAdmin<Record<string, unknown>>("users", targetUid);
    expect(persisted?.employeeNumber).toBe(empNumber);
  });

  it("a role with no HR access at all (Staff) is still genuinely rejected — the fix isn't a blanket unlock", async () => {
    await signInAs("Staff");
    const targetUid = "employee-staff-blocked-" + Date.now();
    await seedDoc("users", targetUid, { uid: targetUid, role: "Staff", email: "x@test.local", createdAt: new Date().toISOString() });

    await expect(createEmployee(makeEmployeeData(targetUid))).rejects.toThrow(/permission/i);
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
