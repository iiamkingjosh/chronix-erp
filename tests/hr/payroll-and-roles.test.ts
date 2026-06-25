import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin, signOutCurrent, seedUserRole } from "../helpers/emulator";
import { createPayrollRun, markAllPaid, getPayrollRun } from "@/lib/hr-service";
import { getDocs, collection, query } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { GET as payslipRoute } from "@/app/api/payslip/route";
import { POST as migrateRoute } from "@/app/api/admin/migrate-employee-numbers/route";
import { NextRequest } from "next/server";
import type { PayrollEntry } from "@/types/hr";

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

function makeEntry(overrides: Partial<PayrollEntry> = {}): PayrollEntry {
  return {
    uid: "emp-1",
    name: "Test Employee",
    role: "Staff",
    department: "Engineering",
    baseSalary: 500_000,
    deductions: 0,
    netPay: 500_000, // deliberately wrong / unenriched, to test D4
    status: "pending",
    ...overrides,
  };
}

describe("Invariant #4 — a completed payroll run posts exactly one journal entry (System Admin: the one role that can do both halves)", () => {
  it("markAllPaid posts one journal entry for the run", async () => {
    const { uid } = await signInAs("System Admin");
    const run = await createPayrollRun({
      month: 6, year: 2026, status: "draft",
      entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test Admin",
    });

    await markAllPaid(run.id, run.entries, uid);

    const entries = await queryAsAdmin("journal_entries", "referenceId", run.id);
    expect(entries).toHaveLength(1);

    const persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    expect(persisted?._journalPosted).toBe(true);
    expect(persisted?.status).toBe("completed");
  });
});

describe("NEW FINDING — HR (the role whose actual job this is) cannot create a payroll run at all", () => {
  it("createPayrollRun is rejected by rules for HR: payroll_runs create/update requires canManageHR()||isSystemAdmin() — wait, canManageHR() includes HR, so creation succeeds — but the SAME role cannot post the resulting journal entry", async () => {
    const { uid } = await signInAs("HR");
    const run = await createPayrollRun({
      month: 6, year: 2026, status: "draft",
      entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test HR",
    });
    expect(run.id).toBeDefined(); // creating the run itself succeeds — HR is covered by canManageHR()

    // markAllPaid does NOT throw (it catches the journal failure internally),
    // so this resolves even though the journal half silently failed.
    await markAllPaid(run.id, run.entries, uid);

    let persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    expect(persisted?.status).toBe("completed"); // the run-completion update succeeded (canManageHR covers it)

    // EXPECTED under invariant #4 (a completed run posts exactly one
    // journal entry): there should be a journal entry here. ACTUAL: HR is
    // not in canManageFinance() (which is isRootAdmin||isCEO||isCFO||
    // isSystemAdmin||isFinanceOfficer — HR is in none of those), and not
    // isSalesRep() either, so the journal_entries create is rejected by
    // rules. markAllPaid's own try/catch swallows this into _journalError,
    // so HR sees "Payroll completed" with no indication the books were
    // never updated.
    const entries = await queryAsAdmin("journal_entries", "referenceId", run.id);
    expect(entries).toHaveLength(0);
    expect(persisted?._journalPosted).toBeUndefined();

    // NOTE ON TEST RELIABILITY (not a relaxed assertion — a real property of
    // the code under test): markAllPaid's catch block writes _journalError
    // via `updateDoc(...).catch(() => {})` with NO `await` — so the function
    // itself can return before that write commits. Polling briefly here
    // because the underlying app code provides no signal of when it's safe
    // to check; the expected final value below is unchanged.
    for (let i = 0; i < 20 && persisted?._journalError === undefined; i++) {
      await new Promise((r) => setTimeout(r, 50));
      persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    }
    expect(persisted?._journalError).toBeDefined(); // the failure IS recorded on the doc, just not surfaced as a blocking error to the caller, and not even guaranteed to be there yet when the caller's own await resolves
  });
});

describe("NEW FINDING — CFO (a finance-management role) cannot create a payroll run at all", () => {
  it("createPayrollRun is rejected outright for CFO — payroll_runs create/update requires canManageHR()||isSystemAdmin(), and CFO has neither", async () => {
    const { uid } = await signInAs("CFO");
    await expect(
      createPayrollRun({
        month: 6, year: 2026, status: "draft",
        entries: [makeEntry()],
        totalGross: 0, totalDeductions: 0, totalNet: 0,
        generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test CFO",
      })
    ).rejects.toThrow(/permission/i);
  });
});

describe("DEVIATION D4 — the page's pre-computed payroll totals are silently discarded and recomputed server-side", () => {
  it("createPayrollRun ignores the caller's totalNet/totalGross and recomputes its own post-PAYE figures", async () => {
    const { uid } = await signInAs("System Admin");
    // Deliberately wrong totals, exactly mirroring what payroll/page.tsx's
    // handleGenerate computes pre-PAYE (netPay == baseSalary at that point).
    const wrongTotalNet = 500_000; // would be correct only if PAYE were ₦0
    const run = await createPayrollRun({
      month: 6, year: 2026, status: "draft",
      entries: [makeEntry({ baseSalary: 500_000, netPay: 500_000 })],
      totalGross: 500_000,
      totalDeductions: 0,
      totalNet: wrongTotalNet,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test Admin",
    });

    const persisted = await getPayrollRun(run.id);
    // EXPECTED if the page's numbers were authoritative: totalNet === 500,000.
    // ACTUAL: createPayrollRun recomputes via enrichEntriesWithPAYE, which
    // applies real PAYE/pension/NHF — so the persisted figure is LOWER than
    // what was passed in, confirming the page's own computation is dead work.
    expect(persisted!.totalNet).toBeLessThan(wrongTotalNet);
    expect(persisted!.entries[0].payeAmount).toBeGreaterThan(0); // PAYE was actually applied server-side
  });
});

// RESOLVED (Payslip module rebuild, Stage 1): the rules-level payroll_runs
// read rule and the payslip API's access list now agree, instead of three
// independently-declared MANAGER_ROLES Sets disagreeing with the rule and
// with each other. Canonical individual-payslip access is now exactly
// manage:hr (Root Admin, System Admin, HR) on both sides — CFO and CEO are
// deliberately excluded from both (they get the aggregate payroll summary
// instead, not individual slips).
describe("D3 — payroll_runs rule and payslip API access now agree (CFO/CEO consistently excluded from both)", () => {
  it("CFO can no longer read payroll_runs directly (rules), consistent with always having been excluded from the payslip API", async () => {
    const setupUid = (await signInAs("System Admin")).uid;
    await createPayrollRun({
      month: 6, year: 2026, status: "draft", entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: setupUid, generatedByName: "Setup Admin",
    });
    await signOutCurrent();
    await signInAs("CFO");

    // Rules-level: isCFO() was dropped from the payroll_runs read rule.
    let code: string | undefined;
    try {
      await getDocs(query(collection(db, "payroll_runs")));
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("permission-denied");

    // API-level: CFO was already excluded, still is.
    const otherUid = "other-employee-" + Date.now();
    const idToken = await auth.currentUser!.getIdToken();
    const req = new NextRequest(`http://localhost/api/payslip?uid=${otherUid}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await payslipRoute(req);
    expect(res.status).toBe(403);
  });

  it("CEO is excluded from both the payslip API and payroll_runs directly, consistently", async () => {
    const setupUid = (await signInAs("System Admin")).uid;
    await createPayrollRun({
      month: 6, year: 2026, status: "draft", entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: setupUid, generatedByName: "Setup Admin",
    });
    await signOutCurrent();
    await signInAs("CEO");

    // API-level: CEO is no longer in the canonical access list (manage:hr).
    const idToken = await auth.currentUser!.getIdToken();
    const req = new NextRequest(`http://localhost/api/payslip?uid=some-other-uid`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await payslipRoute(req);
    expect(res.status).toBe(403);

    // Rules-level: CEO was already excluded from payroll_runs, still is.
    let code: string | undefined;
    try {
      await getDocs(query(collection(db, "payroll_runs")));
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("permission-denied");
  });

  it("Root Admin stored as the legacy 'Root' alias can still access another employee's payslip via the API — the actual Stage 1 fix, not just the canonical-string case", async () => {
    const setupUid = (await signInAs("System Admin")).uid;
    await createPayrollRun({
      month: 6, year: 2026, status: "draft", entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: setupUid, generatedByName: "Setup Admin",
    });
    await signOutCurrent();
    const { uid } = await signInAs("Root Admin");
    // Overwrite the seeded canonical role with the legacy alias string the
    // old raw MANAGER_ROLES Set could never have recognized.
    await seedUserRole(uid, "Root" as never);

    const idToken = await auth.currentUser!.getIdToken();
    const req = new NextRequest(`http://localhost/api/payslip?uid=other-employee`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await payslipRoute(req);
    expect(res.status).toBe(200);
  });
});

describe("FIXED: DEVIATION D2 — migrate-employee-numbers now honors legacy role aliases via resolveRole(), same as the rest of the app", () => {
  it("a caller stored with the legacy 'Root' alias now succeeds, exactly like the canonical 'Root Admin' string", async () => {
    const { uid } = await signInAs("Root Admin");
    // Overwrite the seeded canonical role with the legacy alias string that
    // ROLE_ALIASES maps back to Root Admin (roles.ts: "Root" -> ROOT_ADMIN).
    await seedUserRole(uid, "Root" as never);

    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/admin/migrate-employee-numbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await migrateRoute(req as never);

    expect(res.status).toBe(200);
  });

  it("the canonical 'Root Admin' string still succeeds (the fix didn't narrow the previously-working case)", async () => {
    await signInAs("Root Admin");
    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/admin/migrate-employee-numbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await migrateRoute(req as never);
    expect(res.status).toBe(200);
  });

  it("a non-privileged role (Staff) is still correctly rejected — the fix isn't a blanket unlock", async () => {
    await signInAs("Staff");
    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/admin/migrate-employee-numbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await migrateRoute(req as never);
    expect(res.status).toBe(403);
  });

  it("a CANDIDATE employee stored with the legacy 'Manager' alias (-> CEO) is correctly partitioned into the CEO reserved slot, not 'others' — confirms the fix at the row-capture source (line 56), not just the caller check", async () => {
    const { uid: callerUid } = await signInAs("Root Admin");
    const candidateUid = "legacy-manager-candidate-" + Date.now();
    await seedUserRole(candidateUid, "Manager" as never, {
      bankName: "Test Bank",
      accountNumber: "0123456789",
      createdAt: new Date("2020-01-01").toISOString(),
    });

    const idToken = await auth.currentUser!.getIdToken();
    const req = new Request("http://localhost/api/admin/migrate-employee-numbers", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const res = await migrateRoute(req as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { assignments: { uid: string; employeeNumber: string }[] };

    const assigned = body.assignments.find((a) => a.uid === candidateUid);
    // Without resolveRole() at the row-capture source, "Manager" would
    // never match `r.role === ROLES.CEO` and would fall into "others"
    // instead of correctly claiming the reserved CTL002 slot.
    expect(assigned?.employeeNumber).toBe("CTL002");

    // Sanity: the caller itself shouldn't collide with the reserved slots.
    expect(assigned?.uid).not.toBe(callerUid);
  });
});
