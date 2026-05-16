import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { InvoicePDFDocument } from "@/lib/invoice-pdf";
import type { Invoice } from "@/types/finance";
import type { DocumentProps } from "@react-pdf/renderer";

// Read image files once at module load. react-pdf accepts { data: Buffer, format: string }
// which bypasses all network/file fetching in its image loader — no fetch() calls at render time.
function readImg(filename: string): { data: Buffer; format: string } | undefined {
  try {
    const data = fs.readFileSync(path.join(process.cwd(), "public", "images", filename));
    return { data, format: "png" };
  } catch (e) {
    console.error(`[pdf] Could not read ${filename}:`, e);
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

    console.log("[pdf] building element...");
    const raw = InvoicePDFDocument({ invoice, logoSrc: LOGO_IMG, watermarkSrc: WATERMARK_IMG });
    console.log("[pdf] normalizing tree...");
    const pdfElement = normalizeTree(raw) as ReactElement<DocumentProps>;
    console.log("[pdf] calling renderToBuffer...");
    const buffer = await renderToBuffer(pdfElement);
    console.log("[pdf] renderToBuffer done, size:", buffer.length);

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
    return NextResponse.json({ error: `Failed to generate PDF — ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
