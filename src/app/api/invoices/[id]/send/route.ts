import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { InvoicePDFDocument } from "@/lib/invoice-pdf";
import { sendEmail, invoiceEmail } from "@/lib/email-service";
import { logAuditEvent } from "@/lib/audit-service";
import { formatNaira, formatDate } from "@/types/finance";
import type { Invoice } from "@/types/finance";

// Read image files once at module load. react-pdf accepts { data: Buffer, format: string }
// which bypasses all network/file fetching in its image loader — no fetch() calls at render time.
function readImg(filename: string): { data: Buffer; format: string } | undefined {
  try {
    const data = fs.readFileSync(path.join(process.cwd(), "public", "images", filename));
    return { data, format: "png" };
  } catch (e) {
    console.error(`[send] Could not read ${filename}:`, e);
    return undefined;
  }
}
const LOGO_IMG      = readImg("invoice-logo.png");
const WATERMARK_IMG = readImg("invoice-watermark.png");

// Next.js 16 bundles React 19 ($$typeof = react.transitional.element).
// @react-pdf/reconciler uses React 18 and only understands react.element.
// normalizeTree rewrites the entire JSX tree before passing to renderToBuffer.
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

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);

    const body = await req.json() as { clientEmail: string };
    const clientEmail = body.clientEmail?.trim();
    if (!clientEmail) return NextResponse.json({ error: "clientEmail is required" }, { status: 400 });

    const { id } = await context.params;
    const db   = getAdminDb();
    const snap = await db.collection("invoices").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const invoice = { id: snap.id, ...snap.data() } as Invoice;

    // Images are passed as { data: Buffer, format: 'png' } — react-pdf reads directly
    // from the buffer with no network or filesystem calls during rendering.
    const pdfElement = normalizeTree(
      InvoicePDFDocument({ invoice, logoSrc: LOGO_IMG, watermarkSrc: WATERMARK_IMG })
    ) as ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(pdfElement);

    const result = await sendEmail(
      [clientEmail],
      `Invoice ${invoice.invoiceNumber} from Chronix Technology Limited`,
      invoiceEmail(
        invoice.invoiceNumber,
        invoice.client.name,
        formatNaira(invoice.total),
        formatDate(invoice.dueDate),
      ),
      [{ filename: `invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
    );

    if (!result.sent) {
      return NextResponse.json({ error: result.error ?? result.skipped ?? "Failed to send email" }, { status: 500 });
    }

    const now = new Date().toISOString();
    await db.collection("invoices").doc(id).update({ sentAt: now, sentTo: clientEmail });

    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    const caller = callerSnap.data();
    logAuditEvent({
      actorUid:   decoded.uid,
      actorName:  caller?.displayName ?? caller?.email ?? decoded.uid,
      actorRole:  caller?.role ?? "",
      action:     "export",
      module:     "invoices",
      entityId:   id,
      entityRef:  invoice.invoiceNumber,
      details:    `Invoice ${invoice.invoiceNumber} emailed to ${clientEmail}`,
      timestamp:  now,
    });

    return NextResponse.json({ success: true, sentTo: clientEmail });
  } catch (err) {
    console.error("[invoices/send] error:", err);
    return NextResponse.json({ error: `Failed to send invoice — ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
