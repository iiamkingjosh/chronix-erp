import { NextResponse } from "next/server";
import { previewNextInvoiceNumber, getNextInvoiceNumber, getTodayInvoiceCount } from "@/lib/invoiceCounter";

export async function GET() {
  const preview = await previewNextInvoiceNumber();
  const first   = await getNextInvoiceNumber();
  const second  = await getNextInvoiceNumber();
  const count   = await getTodayInvoiceCount();

  return NextResponse.json({ preview, first, second, todayCount: count });
}
