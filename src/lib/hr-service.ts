import {
  collection, doc, setDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion, addDoc, runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";
import type { Employee, PayrollRun, PayrollEntry, PerformanceNote } from "@/types/hr";
import { computeMonthlyPAYE } from "@/types/tax";
import { createPayrollJournalEntry } from "@/lib/accounting/auto-journal";

/* ── Employee number helpers ── */

/** CTL + zero-padded 3-digit number, e.g. formatEmployeeNumber(3) → "CTL003" */
export function formatEmployeeNumber(n: number): string {
  return `CTL${String(n).padStart(3, "0")}`;
}

/**
 * Atomically claims the next sequential employee number for `uid`.
 * Uses a Firestore transaction on `counters/employeeNumber` so concurrent
 * employee-creation requests never receive the same number.
 *
 * Numbers CTL001 and CTL002 are reserved for Root Admin and CEO respectively
 * and are assigned during the one-time migration; the counter is initialised
 * at 2 so the first number issued here is CTL003.
 *
 * Returns the assigned number string (e.g. "CTL004").
 */
export async function assignEmployeeNumber(uid: string): Promise<string> {
  const counterRef = doc(db, "counters", "employeeNumber");
  const userRef    = doc(db, EMP, uid);

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const last        = counterSnap.exists()
      ? (counterSnap.data().lastAssigned as number)
      : 2;           // bootstrap: CTL001 + CTL002 are reserved
    const next        = last + 1;
    const empNumber   = formatEmployeeNumber(next);

    tx.set(counterRef, { lastAssigned: next }, { merge: true });
    tx.update(userRef, { employeeNumber: empNumber });

    return empNumber;
  });
}

const EMP  = "users";
const PAY  = "payroll_runs";

/**
 * Employee HR rows are merged onto `users/{uid}` by Add Employee.
 * Auth-only profiles lack payroll fields; treating every user doc as an employee
 * hid everyone from the "link account" dropdown (existing === all uids).
 */
function userDocHasHrEmployeeRecord(raw: Record<string, unknown>): boolean {
  const bank = typeof raw.bankName === "string" && raw.bankName.trim().length > 0;
  const digits =
    typeof raw.accountNumber === "string" ? raw.accountNumber.replace(/\D/g, "") : "";
  return bank && digits.length >= 10;
}

function mapUserToEmployee(id: string, data: Record<string, unknown>): Employee {
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString();
  const displayName =
    typeof data.fullName === "string" && data.fullName.trim()
      ? data.fullName
      : typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName
        : typeof data.email === "string" && data.email.includes("@")
          ? data.email.split("@")[0]
          : "User";

  return {
    id,
    uid: id,
    employeeNumber: typeof data.employeeNumber === "string" ? data.employeeNumber : undefined,
    fullName: displayName,
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    role: typeof data.role === "string" ? data.role : "Staff",
    department: typeof data.department === "string" ? data.department : "",
    salary: typeof data.salary === "number" ? data.salary : 0,
    bankName: typeof data.bankName === "string" ? data.bankName : "",
    accountNumber: typeof data.accountNumber === "string" ? data.accountNumber : "",
    accountName: typeof data.accountName === "string" ? data.accountName : "",
    dateJoined: typeof data.dateJoined === "string" ? data.dateJoined : createdAt.slice(0, 10),
    status: data.status === "suspended" || data.status === "inactive" ? data.status : "active",
    nextOfKin:
      data.nextOfKin && typeof data.nextOfKin === "object"
        ? {
            name: typeof (data.nextOfKin as { name?: unknown }).name === "string" ? (data.nextOfKin as { name: string }).name : "",
            relationship:
              typeof (data.nextOfKin as { relationship?: unknown }).relationship === "string"
                ? (data.nextOfKin as { relationship: string }).relationship
                : "",
            phone: typeof (data.nextOfKin as { phone?: unknown }).phone === "string" ? (data.nextOfKin as { phone: string }).phone : "",
          }
        : { name: "", relationship: "", phone: "" },
    notes: typeof data.notes === "string" ? data.notes : "",
    performanceNotes: Array.isArray(data.performanceNotes) ? (data.performanceNotes as PerformanceNote[]) : [],
    createdAt,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : createdAt,
  };
}

/* ── Employees ── */

/**
 * Creates (or updates) the HR record for a user and assigns an employee number
 * if one has not already been allocated.  The number is claimed atomically via
 * assignEmployeeNumber() so concurrent creations never collide.
 *
 * Returns the employee number that was assigned (or the pre-existing one).
 */
export async function createEmployee(data: Employee): Promise<string> {
  // Write all HR fields first so the document exists before the transaction
  // tries to update it (Firestore transactions can't update non-existent docs).
  await setDoc(
    doc(db, EMP, data.uid),
    {
      // Keep profile fields safe from accidental blank overwrites.
      ...(data.fullName ? { displayName: data.fullName } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.role ? { role: data.role } : {}),
      phone: data.phone,
      department: data.department,
      salary: data.salary,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      dateJoined: data.dateJoined,
      status: data.status,
      nextOfKin: data.nextOfKin,
      notes: data.notes,
      performanceNotes: data.performanceNotes,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    },
    { merge: true }
  );

  // If a number was already reserved (e.g. via migration) keep it.
  if (data.employeeNumber) return data.employeeNumber;

  // Check Firestore in case a number was assigned between the call and now.
  const snap = await getDoc(doc(db, EMP, data.uid));
  const existing = snap.data()?.employeeNumber as string | undefined;
  if (existing) return existing;

  return assignEmployeeNumber(data.uid);
}

export async function getEmployees(): Promise<Employee[]> {
  const snap = await getDocs(collection(db, EMP));
  return snap.docs
    .map((d) => ({ id: d.id, raw: d.data() as Record<string, unknown> }))
    .filter(({ raw }) => userDocHasHrEmployeeRecord(raw))
    .map(({ id, raw }) => mapUserToEmployee(id, raw))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function getEmployee(uid: string): Promise<Employee | null> {
  const snap = await getDoc(doc(db, EMP, uid));
  return snap.exists() ? mapUserToEmployee(snap.id, snap.data() as Record<string, unknown>) : null;
}

export async function updateEmployee(uid: string, data: Partial<Employee>): Promise<void> {
  await updateDoc(doc(db, EMP, uid), { ...data, updatedAt: new Date().toISOString() });
}

export async function addPerformanceNote(uid: string, note: PerformanceNote): Promise<void> {
  await updateDoc(doc(db, EMP, uid), {
    performanceNotes: arrayUnion(note),
    updatedAt: new Date().toISOString(),
  });
}

export async function suspendEmployee(uid: string): Promise<void> {
  await updateDoc(doc(db, EMP, uid), {
    status:    "suspended",
    updatedAt: new Date().toISOString(),
  });
}

export async function activateEmployee(uid: string): Promise<void> {
  await updateDoc(doc(db, EMP, uid), {
    status:    "active",
    updatedAt: new Date().toISOString(),
  });
}

/** Permanently deletes the employee record from Firestore. */
export async function deleteEmployee(uid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to delete users.");
  }

  const token = await currentUser.getIdToken();
  const res = await fetch(`/api/admin/users/${uid}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let message = "Unable to delete user.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
}

/* ── Payroll ── */

/**
 * Stamps each entry with the monthly PAYE computed at generation time so
 * payslips, markAllPaid, and the backfill all use the same authoritative figure.
 */
function enrichEntriesWithPAYE(entries: PayrollEntry[]): {
  entries: PayrollEntry[];
  totalGross: number;
  totalPAYE: number;
  totalNet: number;
} {
  const enriched = entries.map((e) => {
    const { monthly } = computeMonthlyPAYE(e.baseSalary);
    const paye   = Math.round(monthly);
    const net    = e.baseSalary - paye - (e.deductions ?? 0);
    return { ...e, payeAmount: paye, netPay: net };
  });
  const totalGross = enriched.reduce((s, e) => s + e.baseSalary, 0);
  const totalPAYE  = enriched.reduce((s, e) => s + (e.payeAmount ?? 0), 0);
  const totalNet   = enriched.reduce((s, e) => s + e.netPay, 0);
  return { entries: enriched, totalGross, totalPAYE, totalNet };
}

export async function createPayrollRun(data: Omit<PayrollRun, "id">): Promise<PayrollRun> {
  const { entries, totalGross, totalNet } = enrichEntriesWithPAYE(data.entries);
  const totalPAYE = entries.reduce((s, e) => s + (e.payeAmount ?? 0), 0);
  const payload = {
    ...data,
    entries,
    totalGross,
    totalDeductions: totalPAYE + (data.totalDeductions ?? 0),
    totalNet,
  };
  const ref = await addDoc(collection(db, PAY), payload);
  return { ...payload, id: ref.id };
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const snap = await getDocs(query(collection(db, PAY), orderBy("year", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRun));
}

export async function getPayrollRun(id: string): Promise<PayrollRun | null> {
  const snap = await getDoc(doc(db, PAY, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PayrollRun) : null;
}

export async function markEntryPaid(
  runId: string,
  uid: string,
  currentEntries: PayrollEntry[],
  userId: string,
): Promise<void> {
  const now     = new Date().toISOString();
  const updated = currentEntries.map((e) =>
    e.uid === uid ? { ...e, status: "paid" as const, paidAt: now } : e
  );
  const allPaid = updated.every((e) => e.status === "paid");
  await updateDoc(doc(db, PAY, runId), {
    entries:      updated,
    status:       allPaid ? "completed" : "draft",
    updatedAt:    now,
    ...(allPaid ? { completedAt: now } : {}),
  });
  if (allPaid) {
    const run = await getPayrollRun(runId);
    if (run) {
      const fullRun = { ...run, entries: updated };
      createPayrollJournalEntry(fullRun, userId).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[accounting] payroll journal failed:", msg);
        updateDoc(doc(db, PAY, runId), { _journalError: msg }).catch(() => {});
      });
    }
  }
}

export async function markAllPaid(
  runId: string,
  currentEntries: PayrollEntry[],
  userId: string,
): Promise<void> {
  const now     = new Date().toISOString();
  const updated = currentEntries.map((e) => ({ ...e, status: "paid" as const, paidAt: now }));
  await updateDoc(doc(db, PAY, runId), {
    entries:     updated,
    status:      "completed",
    completedAt: now,
    updatedAt:   now,
  });
  const run = await getPayrollRun(runId);
  if (run) {
    const fullRun = { ...run, entries: updated };
    createPayrollJournalEntry(fullRun, userId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[accounting] payroll journal failed:", msg);
      updateDoc(doc(db, PAY, runId), { _journalError: msg }).catch(() => {});
    });
  }
}
