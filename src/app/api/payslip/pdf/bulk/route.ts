import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { BulkPayslipPDFDocument } from "@/lib/payslip-pdf";
import { canManageOthersPayslips } from "@/lib/payslip-access";
import { MONTHS } from "@/types/hr";
import type { PayslipSummary } from "@/types/hr";

function readImg(filename: string): { data: Buffer; format: "png" | "jpg" } | undefined {
  try {
    const data = fs.readFileSync(path.join(process.cwd(), "public", "images", filename));
    return { data, format: "png" };
  } catch { return undefined; }
}
const LOGO_IMG = readImg("invoice-logo.png");

/* React 19 / react-pdf reconciler fix (same as single-slip route) */
const REACT_ELEMENT      = Symbol.for("react.element");
const REACT_TRANSITIONAL = Symbol.for("react.transitional.element");
function normalizeTree(node: unknown): unknown {
  if (node === null || node === undefined || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeTree);
  const obj = node as Record<string, unknown>;
  if (obj.$$typeof === REACT_TRANSITIONAL || obj.$$typeof === REACT_ELEMENT) {
    const props = obj.props as Record<string, unknown> | undefined;
    return {
      $$typeof: REACT_ELEMENT,
      type:     obj.type,
      key:      obj.key ?? null,
      ref:      null,
      props:    props ? { ...props, children: normalizeTree(props.children) } : {},
      _owner:   null,
    };
  }
  return node;
}

export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded   = await getAdminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const body = await req.json() as { uid?: string; months?: { year: number; month: number }[] };
    const { uid, months } = body;

    if (!uid || !months?.length) {
      return NextResponse.json({ error: "uid and months[] required" }, { status: 400 });
    }
    if (months.length > 12) {
      return NextResponse.json({ error: "Maximum 12 months per download" }, { status: 400 });
    }

    /* authorise: own payslip or manager */
    if (callerUid !== uid) {
      const callerSnap = await getAdminDb().collection("users").doc(callerUid).get();
      const role       = callerSnap.data()?.role as string | undefined;
      if (!canManageOthersPayslips(role)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    /* fetch employee profile */
    const empSnap = await getAdminDb().collection("users").doc(uid).get();
    const emp     = empSnap.data() ?? {};
    const employeeNumber  = emp.employeeNumber  as string | undefined;
    const employeeName    = (emp.fullName ?? emp.displayName ?? emp.email ?? "Unknown") as string;
    const employeeRole    = (emp.role       ?? "") as string;
    const employeeDept    = (emp.department ?? "") as string;

    /* collect summaries for every requested month */
    const summaries: PayslipSummary[] = [];

    for (const { year, month } of months) {
      const runsSnap = await getAdminDb()
        .collection("payroll_runs")
        .where("month", "==", month)
        .where("year",  "==", year)
        .limit(1)
        .get();

      if (runsSnap.empty) continue;

      const run   = runsSnap.docs[0].data();
      const entry = (run.entries as Array<Record<string, unknown>>).find((e) => e.uid === uid);
      if (!entry) continue;

      const empNum = employeeNumber ?? uid.slice(-4).toUpperCase();
      summaries.push({
        month,
        year,
        baseSalary:         (entry.baseSalary  as number) ?? 0,
        payeAmount:         (entry.payeAmount  as number) ?? 0,
        deductions:         (entry.deductions  as number) ?? 0,
        netPay:             (entry.netPay      as number) ?? 0,
        status:             (entry.status as "pending" | "paid") ?? "pending",
        paidAt:             entry.paidAt as string | undefined,
        referenceNumber:    `PSL-${year}-${String(month).padStart(2, "0")}-${empNum}`,
        employeeName,
        employeeRole,
        employeeDepartment: employeeDept,
        employeeNumber,
      });
    }

    if (!summaries.length) {
      return NextResponse.json({ error: "No payslip data found for selected months" }, { status: 404 });
    }

    /* generate PDF */
    const raw        = BulkPayslipPDFDocument({ summaries, logoSrc: LOGO_IMG });
    const normalized = normalizeTree(raw) as ReactElement<DocumentProps>;
    const buffer     = await renderToBuffer(normalized);

    const sorted   = [...summaries].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
    const first    = sorted[0];
    const last     = sorted[sorted.length - 1];
    const rangeStr = first && last
      ? `${MONTHS[first.month - 1]}-${first.year}_to_${MONTHS[last.month - 1]}-${last.year}`
      : "compiled";
    const filename = `payslip-${rangeStr}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(buffer.length),
      },
    });
  } catch (err) {
    console.error("[payslip/pdf/bulk] error:", err);
    return NextResponse.json({
      error: `Failed to generate PDF — ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
