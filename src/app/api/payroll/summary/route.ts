import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isRateLimited } from "@/lib/rate-limit";
import { canViewPayrollSummary } from "@/lib/payroll-summary-access";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`payroll-summary:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const callerSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    const role = callerSnap.data()?.role as string | undefined;

    if (!canViewPayrollSummary(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const runId = req.nextUrl.searchParams.get("runId");
    const db = getAdminDb();

    const runDoc = runId
      ? await db.collection("payroll_runs").doc(runId).get()
      : (await db.collection("payroll_runs").orderBy("year", "desc").orderBy("month", "desc").limit(1).get()).docs[0];

    if (!runDoc || !runDoc.exists) {
      return NextResponse.json({ error: "No payroll run found" }, { status: 404 });
    }

    const run = runDoc.data()!;
    const entries = (run.entries ?? []) as Array<Record<string, unknown>>;

    const totalAmount = entries.reduce((sum, e) => sum + ((e.netPay as number) ?? 0), 0);
    const headcount = entries.length;

    // Deliberately NO department breakdown: checked the real payroll_runs
    // data before building this, and 4 of 5 departments currently have
    // exactly 1 employee — a per-department total would just be that one
    // person's exact net pay, defeating the entire point of an aggregate,
    // no-individual-figures view. Omitted entirely rather than shipped
    // with a privacy hole or a fragile "fold small ones into Other"
    // threshold that would need to be revisited once there's enough real
    // multi-person department data to make a breakdown meaningful.
    return NextResponse.json({
      runId: runDoc.id,
      month: run.month,
      year: run.year,
      status: run.status,
      totalAmount,
      headcount,
    });
  } catch (err) {
    console.error("[payroll/summary] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
