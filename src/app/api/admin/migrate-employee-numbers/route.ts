import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ROLES } from "@/types/roles";
import { formatEmployeeNumber } from "@/lib/hr-service";

/**
 * POST /api/admin/migrate-employee-numbers
 *
 * One-time migration: assigns CTL employee numbers to all existing employees
 * who don't already have one.
 *
 * Reserved slots:
 *   CTL001 → first Root Admin employee (by createdAt, ascending)
 *   CTL002 → first CEO employee        (by createdAt, ascending)
 *   CTL003+ → all others               (sorted by createdAt ascending)
 *
 * The Firestore counter document (counters/employeeNumber.lastAssigned) is
 * updated to the highest number assigned so new employees seamlessly continue
 * the sequence.
 *
 * Safe to re-run: employees that already have a number are left untouched.
 * Root Admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const db        = getAdminDb();

    const decoded   = await adminAuth.verifyIdToken(idToken);
    const callerDoc = await db.collection("users").doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== ROLES.ROOT_ADMIN) {
      return NextResponse.json({ error: "Root Admin only." }, { status: 403 });
    }

    /* ── Fetch all user docs ── */
    const allUsers = await db.collection("users").get();

    type UserRow = {
      uid: string;
      role: string;
      createdAt: string;
      hasHrRecord: boolean;
      employeeNumber?: string;
    };

    const rows: UserRow[] = allUsers.docs.map((d) => {
      const data = d.data();
      const bankName     = typeof data.bankName === "string" && data.bankName.trim().length > 0;
      const accountDigits = typeof data.accountNumber === "string"
        ? data.accountNumber.replace(/\D/g, "") : "";
      return {
        uid:            d.id,
        role:           typeof data.role === "string" ? data.role : "",
        createdAt:      typeof data.createdAt === "string" ? data.createdAt : "9999",
        hasHrRecord:    bankName && accountDigits.length >= 10,
        employeeNumber: typeof data.employeeNumber === "string" ? data.employeeNumber : undefined,
      };
    });

    /* ── Separate already-numbered from candidates ── */
    const candidates = rows
      .filter((r) => r.hasHrRecord && !r.employeeNumber)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (candidates.length === 0) {
      return NextResponse.json({ message: "Nothing to migrate — all employees already have numbers.", assigned: 0 });
    }

    /* ── Determine the current counter high-water mark ── */
    const counterSnap = await db.collection("counters").doc("employeeNumber").get();
    let lastAssigned  = counterSnap.exists ? (counterSnap.data()?.lastAssigned as number ?? 2) : 2;

    /* ── Partition by reserved roles ── */
    const rootAdmins = candidates.filter((r) => r.role === ROLES.ROOT_ADMIN);
    const ceos       = candidates.filter((r) => r.role === ROLES.CEO);
    const others     = candidates.filter((r) => r.role !== ROLES.ROOT_ADMIN && r.role !== ROLES.CEO);

    const assignments: { uid: string; number: string }[] = [];

    function assign(uid: string, n: number) {
      assignments.push({ uid, number: formatEmployeeNumber(n) });
      if (n > lastAssigned) lastAssigned = n;
    }

    /* CTL001 → first Root Admin (if not yet numbered) */
    if (rootAdmins.length > 0) {
      const existing001 = rows.find((r) => r.employeeNumber === "CTL001");
      if (!existing001) assign(rootAdmins[0].uid, 1);
      // Additional root admins (rare) fall through to sequential below
      rootAdmins.slice(1).forEach((r) => {
        lastAssigned += 1;
        assign(r.uid, lastAssigned);
      });
    }

    /* CTL002 → first CEO */
    if (ceos.length > 0) {
      const existing002 = rows.find((r) => r.employeeNumber === "CTL002");
      if (!existing002) assign(ceos[0].uid, 2);
      ceos.slice(1).forEach((r) => {
        lastAssigned += 1;
        assign(r.uid, lastAssigned);
      });
    }

    /* CTL003+ → everyone else, in createdAt order */
    if (lastAssigned < 2) lastAssigned = 2;
    for (const r of others) {
      lastAssigned += 1;
      assign(r.uid, lastAssigned);
    }

    /* ── Batch-write assignments ── */
    const BATCH_SIZE = 400; // Firestore batch limit is 500 operations
    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const { uid, number } of assignments.slice(i, i + BATCH_SIZE)) {
        batch.update(db.collection("users").doc(uid), { employeeNumber: number });
      }
      await batch.commit();
    }

    /* ── Update counter ── */
    await db.collection("counters").doc("employeeNumber").set({ lastAssigned }, { merge: true });

    return NextResponse.json({
      message: `Migration complete. ${assignments.length} employee(s) numbered.`,
      assigned: assignments.length,
      assignments: assignments.map((a) => ({ uid: a.uid, employeeNumber: a.number })),
    });
  } catch (err) {
    console.error("[migrate-employee-numbers]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
