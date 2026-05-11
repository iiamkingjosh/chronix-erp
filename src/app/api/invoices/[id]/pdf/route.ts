import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { InvoicePDFDocument } from "@/lib/invoice-pdf";
import type { Invoice } from "@/types/finance";
import type { DocumentProps } from "@react-pdf/renderer";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await getAdminAuth().verifyIdToken(idToken);

    const { id } = await context.params;
    const db   = getAdminDb();
    const snap = await db.collection("invoices").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const invoice = { id: snap.id, ...snap.data() } as Invoice;

    const buffer = await renderToBuffer(
      createElement(InvoicePDFDocument, { invoice }) as ReactElement<DocumentProps>
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
        "Content-Length":      String(buffer.length),
      },
    });
  } catch (err) {
    console.error("[invoices/pdf] error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
