import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { PayslipPDFDocument } from "@/lib/payslip-pdf";
import { canManageOthersPayslips } from "@/lib/payslip-access";
import { isRateLimited } from "@/lib/rate-limit";
import { MONTHS } from "@/types/hr";
import type { PayslipSummary } from "@/types/hr";

function readImg(filename: string): { data: Buffer; format: "png" | "jpg" } | undefined {
  try {
    const data = fs.readFileSync(path.join(process.cwd(), "public", "images", filename));
    return { data, format: "png" };
  } catch { return undefined; }
}
const LOGO_IMG = readImg("invoice-logo.png");

// Next.js 16 bundles React 19; @react-pdf/reconciler uses React 18.
// normalizeTree rewrites $$typeof before renderToBuffer.
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

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`payslip-pdf:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded   = await getAdminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const params    = req.nextUrl.searchParams;
    const uid       = params.get("uid");
    const year      = parseInt(params.get("year")  ?? "", 10);
    const month     = parseInt(params.get("month") ?? "", 10);

    if (!uid || isNaN(year) || isNaN(month)) {
      return NextResponse.json({ error: "uid, year, month required" }, { status: 400 });
    }

    if (callerUid !== uid) {
      const callerSnap = await getAdminDb().collection("users").doc(callerUid).get();
      const role       = callerSnap.data()?.role as string | undefined;
      if (!canManageOthersPayslips(role)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const runsSnap = await getAdminDb()
      .collection("payroll_runs")
      .where("month", "==", month)
      .where("year",  "==", year)
      .limit(1)
      .get();

    if (runsSnap.empty) {
      return NextResponse.json({ error: "Payroll run not found" }, { status: 404 });
    }

    const run   = runsSnap.docs[0].data();
    const entry = (run.entries as Array<Record<string, unknown>>).find((e) => e.uid === uid);
    if (!entry) {
      return NextResponse.json({ error: "No payslip entry for this employee" }, { status: 404 });
    }

    const empSnap = await getAdminDb().collection("users").doc(uid).get();
    const emp     = empSnap.data() ?? {};
    const employeeNumber = emp.employeeNumber as string | undefined;
    const empNum         = employeeNumber ?? uid.slice(-4).toUpperCase();

    const summary: PayslipSummary = {
      month,
      year,
      baseSalary:         (entry.baseSalary as number)  ?? 0,
      payeAmount:         (entry.payeAmount as number)  ?? 0,
      deductions:         (entry.deductions as number)  ?? 0,
      netPay:             (entry.netPay     as number)  ?? 0,
      status:             (entry.status as "pending" | "paid") ?? "pending",
      paidAt:             entry.paidAt as string | undefined,
      referenceNumber:    `PSL-${year}-${String(month).padStart(2, "0")}-${empNum}`,
      employeeName:       (emp.fullName ?? emp.displayName ?? emp.email ?? "Unknown") as string,
      employeeRole:       (emp.role       ?? "") as string,
      employeeDepartment: (emp.department ?? "") as string,
      employeeNumber,
    };

    const raw        = PayslipPDFDocument({ summary, logoSrc: LOGO_IMG });
    const normalized = normalizeTree(raw) as ReactElement<DocumentProps>;
    const buffer     = await renderToBuffer(normalized);
    const filename   = `payslip-${MONTHS[month - 1]}-${year}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(buffer.length),
      },
    });
  } catch (err) {
    console.error("[payslip/pdf] error:", err);
    return NextResponse.json({
      error: `Failed to generate PDF — ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
