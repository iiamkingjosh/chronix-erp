import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isRateLimited } from "@/lib/rate-limit";
import { canManageOthersPayslips } from "@/lib/payslip-access";
import type { PayslipSummary } from "@/types/hr";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`payslip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded   = await getAdminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const uid       = req.nextUrl.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    if (callerUid !== uid) {
      const callerSnap = await getAdminDb().collection("users").doc(callerUid).get();
      const role       = callerSnap.data()?.role as string | undefined;
      if (!canManageOthersPayslips(role)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const empSnap = await getAdminDb().collection("users").doc(uid).get();
    const emp     = empSnap.data() ?? {};
    const employeeNumber  = emp.employeeNumber  as string | undefined;
    const employeeName    = (emp.fullName ?? emp.displayName ?? emp.email ?? "Unknown") as string;
    const employeeRole    = (emp.role       ?? "") as string;
    const employeeDept    = (emp.department ?? "") as string;

    const runsSnap = await getAdminDb()
      .collection("payroll_runs")
      .orderBy("year",  "desc")
      .orderBy("month", "desc")
      .get();

    const summaries: PayslipSummary[] = [];

    for (const runDoc of runsSnap.docs) {
      const run     = runDoc.data();
      const entries = (run.entries ?? []) as Array<Record<string, unknown>>;
      const entry   = entries.find((e) => e.uid === uid);
      if (!entry) continue;

      const month  = run.month  as number;
      const year   = run.year   as number;
      const empNum = employeeNumber ?? uid.slice(-4).toUpperCase();

      type LoanDeductionRecord = { loanId: string; amountDeducted: number; shortfall: number; remainingBalance: number };
      summaries.push({
        month,
        year,
        baseSalary:         (entry.baseSalary       as number) ?? 0,
        payeAmount:         (entry.payeAmount       as number) ?? 0,
        deductions:         (entry.deductions       as number) ?? 0,
        employeePension:    entry.employeePension   as number | undefined,
        nhf:                entry.nhf               as number | undefined,
        deductionItems:     entry.deductionItems    as { label: string; amount: number }[] | undefined,
        loanDeduction:      entry.loanDeduction     as LoanDeductionRecord | undefined,
        netPay:             (entry.netPay           as number) ?? 0,
        status:             (entry.status as "pending" | "paid") ?? "pending",
        paidAt:             entry.paidAt as string | undefined,
        referenceNumber:    `PSL-${year}-${String(month).padStart(2, "0")}-${empNum}`,
        employeeName,
        employeeRole,
        employeeDepartment: employeeDept,
        employeeNumber,
      });
    }

    return NextResponse.json(summaries);
  } catch (err) {
    console.error("[payslip] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
