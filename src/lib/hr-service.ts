import {
  collection, doc, setDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion, addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { auth } from "./firebase";
import type { Employee, PayrollRun, PayrollEntry, PerformanceNote } from "@/types/hr";

const EMP  = "users";
const PAY  = "payroll_runs";

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
export async function createEmployee(data: Employee): Promise<void> {
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
}

export async function getEmployees(): Promise<Employee[]> {
  const snap = await getDocs(collection(db, EMP));
  return snap.docs
    .map((d) => mapUserToEmployee(d.id, d.data() as Record<string, unknown>))
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
export async function createPayrollRun(data: Omit<PayrollRun, "id">): Promise<PayrollRun> {
  const ref = await addDoc(collection(db, PAY), data);
  return { ...data, id: ref.id };
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const snap = await getDocs(query(collection(db, PAY), orderBy("year", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRun));
}

export async function getPayrollRun(id: string): Promise<PayrollRun | null> {
  const snap = await getDoc(doc(db, PAY, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PayrollRun) : null;
}

export async function markEntryPaid(runId: string, uid: string, currentEntries: PayrollEntry[]): Promise<void> {
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
}

export async function markAllPaid(runId: string, currentEntries: PayrollEntry[]): Promise<void> {
  const now     = new Date().toISOString();
  const updated = currentEntries.map((e) => ({ ...e, status: "paid" as const, paidAt: now }));
  await updateDoc(doc(db, PAY, runId), {
    entries:     updated,
    status:      "completed",
    completedAt: now,
    updatedAt:   now,
  });
}
