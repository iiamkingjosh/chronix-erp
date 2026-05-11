import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { InvoicePDFDocument } from "@/lib/invoice-pdf";
import { sendEmail, invoiceEmail } from "@/lib/email-service";
import { logAuditEvent } from "@/lib/audit-service";
import { formatNaira, formatDate } from "@/types/finance";
import type { Invoice } from "@/types/finance";

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

    /* Generate PDF */
    const pdfBuffer = await renderToBuffer(
      createElement(InvoicePDFDocument, { invoice }) as ReactElement<DocumentProps>
    );

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
