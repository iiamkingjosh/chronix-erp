import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin, signOutCurrent, seedUserRole } from "../helpers/emulator";
import { createPayrollRun, markAllPaid, markEntryPaid, getPayrollRun } from "@/lib/hr-service";
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

describe("FIXED: HR can now post the payroll journal entry produced by its own payroll runs", () => {
  it("HR creates a payroll run AND markAllPaid genuinely posts one journal entry — no more silent _journalError", async () => {
    const { uid } = await signInAs("HR");
    const run = await createPayrollRun({
      month: 6, year: 2026, status: "draft",
      entries: [makeEntry()],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test HR",
    });
    expect(run.id).toBeDefined();

    await markAllPaid(run.id, run.entries, uid);

    const entries = await queryAsAdmin("journal_entries", "referenceId", run.id);
    expect(entries).toHaveLength(1); // the journal entry now genuinely exists

    // _journalPosted/_journalError are written via a separate, unawaited
    // updateDoc().catch(() => {}) inside markAllPaid — poll briefly rather
    // than assume the flag has landed the instant markAllPaid() resolves.
    let persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    for (let i = 0; i < 20 && persisted?._journalPosted !== true; i++) {
      await new Promise((r) => setTimeout(r, 50));
      persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    }
    expect(persisted?.status).toBe("completed");
    expect(persisted?._journalPosted).toBe(true);
    expect(persisted?._journalError ?? null).toBeNull(); // no failure recorded — this is the real fix, not a UI-level mask of it
  });

  it("the exception is genuinely scoped to referenceType == 'payroll' — HR is still rejected creating a non-payroll journal entry directly", async () => {
    await signInAs("HR");
    const { addDoc, collection: col } = await import("firebase/firestore");

    await expect(
      addDoc(col(db, "journal_entries"), {
        entryDate: "2026-06-01",
        description: "Attempted manual entry by HR",
        referenceType: "manual",
        referenceId: "test-manual",
        lineItems: [
          { accountCode: "1010", accountName: "Cash", debit: 1000, credit: 0 },
          { accountCode: "4010", accountName: "Revenue", debit: 0, credit: 1000 },
        ],
        status: "posted",
        createdBy: "hr-uid",
        totalDebit: 1000,
        totalCredit: 1000,
        entryNumber: "JE-TEST-1",
        createdAt: new Date().toISOString(),
      })
    ).rejects.toThrow(/permission/i);

    await expect(
      addDoc(col(db, "journal_entries"), {
        entryDate: "2026-06-01",
        description: "Attempted invoice entry by HR",
        referenceType: "invoice",
        referenceId: "test-invoice",
        lineItems: [
          { accountCode: "1100", accountName: "Accounts Receivable", debit: 1000, credit: 0 },
          { accountCode: "4010", accountName: "Revenue", debit: 0, credit: 1000 },
        ],
        status: "posted",
        createdBy: "hr-uid",
        totalDebit: 1000,
        totalCredit: 1000,
        entryNumber: "JE-TEST-2",
        createdAt: new Date().toISOString(),
      })
    ).rejects.toThrow(/permission/i);
  });

  it("the metadata-counter exception is also scoped to journalCounter_* only — HR still cannot touch the invoice/expense counters", async () => {
    await signInAs("HR");
    const { setDoc: setDocFn, doc: docFn } = await import("firebase/firestore");

    await expect(
      setDocFn(docFn(db, "metadata", "invoiceCounter_260601"), { lastNumber: 1 }, { merge: true })
    ).rejects.toThrow(/permission/i);

    await expect(
      setDocFn(docFn(db, "metadata", "expenseCounter_260601"), { lastNumber: 1 }, { merge: true })
    ).rejects.toThrow(/permission/i);

    // The journal counter specifically IS allowed — this is the one
    // metadata doc payroll's journal posting actually needs.
    await expect(
      setDocFn(docFn(db, "metadata", "journalCounter_260601"), { lastNumber: 1 }, { merge: true })
    ).resolves.toBeUndefined();
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

describe("Phase 3 regression — employees without loans are completely unaffected", () => {
  it("markAllPaid for a no-loan employee produces identical journal entry (no 1250 credit line)", async () => {
    const { uid } = await signInAs("System Admin");
    const run = await createPayrollRun({
      month: 7, year: 2026, status: "draft",
      entries: [makeEntry({ baseSalary: 300_000 })],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test Admin",
    });

    await markAllPaid(run.id, run.entries, uid);

    const jeList = await queryAsAdmin("journal_entries", "referenceId", run.id);
    expect(jeList).toHaveLength(1);

    // No 1250 (Staff Loans Receivable) credit line — no loans exist
    const je = jeList[0] as { lineItems?: Array<{ accountCode: string }> };
    const has1250 = (je.lineItems ?? []).some((l) => l.accountCode === "1250");
    expect(has1250).toBe(false);

    // Status and journal flag unchanged from pre-Phase-3 behaviour
    const persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?._journalPosted).toBe(true);
  });

  it("markEntryPaid for a no-loan employee — backward-compatible signature, no loan fields on entry", async () => {
    const { uid } = await signInAs("System Admin");
    const run = await createPayrollRun({
      month: 8, year: 2026, status: "draft",
      entries: [makeEntry({ uid: "emp-solo", baseSalary: 200_000 })],
      totalGross: 0, totalDeductions: 0, totalNet: 0,
      generatedAt: new Date().toISOString(), generatedBy: uid, generatedByName: "Test Admin",
    });

    await markEntryPaid(run.id, "emp-solo", run.entries, uid);

    const persisted = await readDocAsAdmin<Record<string, unknown>>("payroll_runs", run.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?._journalPosted).toBe(true);

    // No loanDeduction field written on the entry
    const entries = (persisted?.entries ?? []) as Array<Record<string, unknown>>;
    const entry = entries.find((e) => e.uid === "emp-solo");
    expect(entry?.loanDeduction).toBeUndefined();
  });
});
