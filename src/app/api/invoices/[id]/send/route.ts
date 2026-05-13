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

// Next.js 16 compiles server-side JSX with React 19's transitional element format
// ($$typeof = Symbol.for("react.transitional.element")).  @react-pdf/reconciler's
// React 18 reconciler only understands Symbol.for("react.element") and throws
// React error #31 on the unknown type.
//
// Both createElement() and the JSX in invoice-pdf.tsx are aliased by Next.js's
// webpack to its bundled React 19, so every element in the tree is "transitional".
// Calling InvoicePDFDocument() directly (as a plain function) and then recursively
// rewriting every $$typeof before handing the tree to renderToBuffer fixes this
// without touching any reconciler internals.
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

    /* Generate PDF — call component directly and normalise the element tree so
       React 19 transitional elements become React 18 elements before the
       @react-pdf/reconciler (React 18 reconciler) processes them. */
    const pdfElement = normalizeTree(InvoicePDFDocument({ invoice })) as ReactElement<DocumentProps>;
    const pdfBuffer  = await renderToBuffer(pdfElement);

    /* Send email with PDF attachment */
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

    /* Mark invoice as sent in Firestore */
    const now = new Date().toISOString();
    await db.collection("invoices").doc(id).update({ sentAt: now, sentTo: clientEmail });

    /* Audit log */
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
