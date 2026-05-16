import {
  Document, Page, View, Text, Image, StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice } from "@/types/finance";
import { COMPANY } from "@/types/finance";

/* ── Asset paths ─────────────────────────────────────────────── */
// Client-side (print HTML) — served from public/
export const LOGO_WEB_PATH      = "/images/invoice-logo.png";
export const WATERMARK_WEB_PATH = "/images/invoice-watermark.png";

/* ── Design tokens (Figma node 302:253) ──────────────────────── */
const BLUE   = "#003366";  // labels, dates, company brand
const BLACK  = "#000000";
const ORANGE = "#ff761b";  // footer fill (Figma: Rectangle 7134109)

/* ── Font aliases — built-in PDF fonts, no CDN required ─────── */
// Avoids network fetches that would hang renderToBuffer
const F_REG  = "Helvetica";
const F_MED  = "Helvetica";       // no native medium; use regular
const F_SEMI = "Helvetica";       // no native semibold; use regular
const F_BOLD = "Helvetica-Bold";
const F_BLD8 = "Helvetica-Bold";  // extraBold → Bold

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtNum(n: number): string {
  const parts = n.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}
function fmtMoney(n: number): string { return `₦ ${fmtNum(n)}`; }  // ₦ + space
function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;   // DD/MM/YYYY
}

/* ── Column widths (content = 595 - 38 - 32 = 525 px) ───────── *
 *  Derived from Figma Frame 8 header x-positions within 518px:
 *    ITEM=14, UNIT PRICE=218, QUANTITY=332, LINE TOTAL=426
 *  Scaled to 525: C1=221, C2=115, C3=95, C4=94  (sum=525 ✓)
 */
const C1 = 221;
const C2 = 115;
const C3 = 95;
const C4 = 94;

/* ── Styles ──────────────────────────────────────────────────── */
const S = StyleSheet.create({

  /* Page — A4 595×842, padding from Figma frame measurements */
  page: {
    paddingTop: 22, paddingBottom: 0,
    paddingLeft: 38, paddingRight: 32,
    fontFamily: F_REG, fontSize: 10, color: BLACK,
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  // "INVOICE" — Inter 600 / 16.84px → Helvetica-Bold 17px
  invoiceTitle: {
    fontSize: 17, fontFamily: F_BOLD, color: BLACK,
    marginTop: 10,
  },
  headerRight: { alignItems: "flex-end" },
  logoRow: {
    flexDirection: "row", alignItems: "center", marginBottom: 5,
  },
  // Logo icon: 50×49 in Figma
  logoIcon: { width: 46, height: 45, objectFit: "contain", marginRight: 8 },
  // "Chronix Tech" — Orbitron 900/17.74px → Helvetica-Bold 17px #003366
  brandText: { fontSize: 17, fontFamily: F_BOLD, color: BLUE },
  // "CHRONIX TECHNOLOGY LIMITED" — Inter 700/12px
  companyFullName: {
    fontSize: 12, fontFamily: F_BOLD, color: BLACK,
    textTransform: "uppercase", marginBottom: 3,
  },
  // Address — Inter 500/12px
  companyAddress: {
    fontSize: 12, fontFamily: F_REG, color: BLACK,
    textAlign: "right", lineHeight: 1.5,
  },

  /* ── Date + Invoice No ── */
  metaRow: {
    flexDirection: "row", alignItems: "flex-start",
    marginBottom: 14, position: "relative",
  },
  // "16/02/2026" — Inter 700/12px #003366
  dateText: { fontSize: 12, fontFamily: F_BOLD, color: BLUE },
  invoiceNoBlock: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  // "INVOICE NO" — Inter 700/12px #000000
  invoiceNoLabel: { fontSize: 12, fontFamily: F_BOLD, color: BLACK },
  // "CT…" — Inter 700/12px #003366
  invoiceNoValue: { fontSize: 12, fontFamily: F_BOLD, color: BLUE },

  /* ── Invoice To ── */
  invoiceToSection: { marginBottom: 14 },
  // "INVOICE TO" — Inter 700/12px
  invoiceToLabel: { fontSize: 12, fontFamily: F_BOLD, color: BLACK, marginBottom: 4 },
  // Client text — Inter 500/12px
  invoiceToText: {
    fontSize: 12, fontFamily: F_REG, color: BLACK, lineHeight: 1.5,
  },

  /* ── Salesperson / Due Date bar ── */
  // Frame 6: 519×44, 1px #000000. Dividers at x=133 and x=438 within 519.
  metaBar: {
    flexDirection: "row",
    border: "1px solid #000000",
    height: 44, marginBottom: 14,
  },
  metaBarLeft: {
    width: 133, paddingLeft: 5, paddingVertical: 5,
    borderRight: "1px solid #000000", justifyContent: "center",
  },
  metaBarSpacer: { flex: 1 },
  metaBarRight: {
    width: 81, paddingLeft: 5, paddingRight: 5, paddingVertical: 5,
    borderLeft: "1px solid #000000", justifyContent: "center", alignItems: "flex-end",
  },
  // "SALESPERSON" — Inter 800/10px #003366
  metaLbl800: { fontSize: 10, fontFamily: F_BLD8, color: BLUE, marginBottom: 3 },
  // "DUE DATE" — Inter 700/10px #003366
  metaLbl700: { fontSize: 10, fontFamily: F_BOLD, color: BLUE, marginBottom: 3 },
  // Values — Inter 700/10px #000000
  metaVal:    { fontSize: 10, fontFamily: F_BOLD, color: BLACK },

  /* ── Table column headers ── */
  // Frame 8: border-bottom 1px #000000. All headers Inter 700/11px #000000
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1px solid #000000",
    paddingBottom: 4, paddingTop: 2,
  },
  thText: { fontSize: 11, fontFamily: F_BOLD, color: BLACK },
  col1: { width: C1, paddingLeft: 10 },
  col2: { width: C2, paddingLeft: 10 },
  col3: { width: C3, textAlign: "center" },
  col4: { width: C4, textAlign: "right", paddingRight: 10 },

  /* ── Items table ── */
  // Frame 7: 525px, 1px solid #000000, NO internal row separators
  itemsTable: { border: "1px solid #000000" },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    minHeight: 33, paddingVertical: 10,
  },
  // Inter 600/11px #000000
  tdText: { fontSize: 11, fontFamily: F_SEMI, color: BLACK },

  /* ── Totals ── */
  // Frame 9: right-aligned, 163px, 0.5px border. Divider at x=58.5. Rows ~17px.
  totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 0 },
  totalsBox:     { width: 163, border: "0.5px solid #000000" },
  totalsRow:     { flexDirection: "row", borderBottom: "0.5px solid #000000", minHeight: 17 },
  totalsRowLast: { flexDirection: "row", minHeight: 17 },
  totalsLblCell: { width: 58, paddingLeft: 3, paddingRight: 3, paddingVertical: 2, justifyContent: "center" },
  totalsDivider: { width: 0.5, backgroundColor: BLACK, alignSelf: "stretch" },
  totalsAmtCell: { flex: 1, paddingLeft: 3, paddingRight: 3, paddingVertical: 2, justifyContent: "center" },
  // Inter 700/11px #000000
  totalsLblTxt: { fontSize: 11, fontFamily: F_BOLD, color: BLACK },
  // Inter 600/11px #000000
  totalsAmtTxt: { fontSize: 11, fontFamily: F_SEMI, color: BLACK, textAlign: "right" },

  /* ── Bank details ── */
  // Frame 10: 444px wide, 1px #000000
  // Column widths from Figma dividers at 153, 255, 356 within 444:
  //   col1=153, col2=102, col3=101, col4=88
  bankTable:   { width: 444, border: "1px solid #000000" },
  bankRowHdr:  { flexDirection: "row", borderBottom: "1px solid #000000" },
  bankRowData: { flexDirection: "row" },
  bk1: { width: 153, padding: "4 5", borderRight: "1px solid #000000" },
  bk2: { width: 102, padding: "4 5", borderRight: "1px solid #000000" },
  bk3: { width: 101, padding: "4 5", borderRight: "1px solid #000000" },
  bk4: { width:  88, padding: "4 5" },
  // Inter 800/10px #003366
  bankTh: { fontSize: 10, fontFamily: F_BLD8, color: BLUE },
  // Inter 700/10px #000000
  bankTd: { fontSize: 10, fontFamily: F_BOLD,  color: BLACK },

  /* ── Thank you ── */
  // "THANK YOU FOR YOUR BUSINESS!" — Inter 700/15px #000000
  thankYou: {
    fontSize: 15, fontFamily: F_BOLD, color: BLACK,
    paddingTop: 10, paddingBottom: 10,
  },

  /* ── Footer bar ── */
  // Figma: Rectangle 7134109, fill #ff761b, h=28, full page width
  footer: {
    backgroundColor: ORANGE, height: 28,
    marginLeft: -38, marginRight: -32,
  },

  /* ── Watermark ── */
  // Figma position (rel to page frame): x=180.64, y=414.64, w=682.95, h=681.60
  // react-pdf content-area coords (subtract padding l=38, t=22):
  //   left = 180 - 38 = 142,  top = 414 - 22 = 392
  watermark: {
    position: "absolute",
    left: 142, top: 392,
    width: 683, height: 682,
    opacity: 0.18,
  },
});

/* ── Component ───────────────────────────────────────────────── */

export function InvoicePDFDocument({
  invoice,
  logoSrc,
  watermarkSrc,
}: {
  invoice: Invoice;
  // Accepts { data: Buffer; format: string } (server-side) or a URL string (print HTML)
  logoSrc?: unknown;
  watermarkSrc?: unknown;
}) {
  const vatPct = ((invoice.vatRate ?? 0.075) * 100).toFixed(1);

  return (
    <Document
      title={`Invoice ${invoice.invoiceNumber}`}
      author={COMPANY.name}
      subject={`Invoice to ${invoice.client.name}`}
    >
      <Page size="A4" style={S.page}>

        {/* ── Watermark (absolute, behind all content) ── */}
        {watermarkSrc ? <Image src={watermarkSrc as string} style={S.watermark} /> : null}

        {/* ── Header: INVOICE left | Logo + Company right ── */}
        <View style={S.header}>
          <Text style={S.invoiceTitle}>INVOICE</Text>
          <View style={S.headerRight}>
            <View style={S.logoRow}>
              {logoSrc ? <Image src={logoSrc as string} style={S.logoIcon} /> : null}
              <Text style={S.brandText}>Chronix Tech</Text>
            </View>
            <Text style={S.companyFullName}>{COMPANY.name}</Text>
            <Text style={S.companyAddress}>
              {"No.7 Jerry Iriabe Street,"}{"\n"}
              {"Lekki Phase 1, Lagos."}{"\n"}
              {COMPANY.phone}{"\n"}
              {COMPANY.website}{"\n"}
              {COMPANY.email}
            </Text>
          </View>
        </View>

        {/* ── Date (left) · Invoice No (centred) ── */}
        <View style={S.metaRow}>
          <Text style={S.dateText}>{fmtDate(invoice.invoiceDate)}</Text>
          <View style={S.invoiceNoBlock}>
            <Text style={S.invoiceNoLabel}>INVOICE NO</Text>
            <Text style={S.invoiceNoValue}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        {/* ── Invoice To ── */}
        <View style={S.invoiceToSection}>
          <Text style={S.invoiceToLabel}>INVOICE TO</Text>
          <Text style={S.invoiceToText}>
            {invoice.client.name}
            {invoice.client.address ? `\nAddress: ${invoice.client.address}` : ""}
            {invoice.client.phone   ? `\nPhone: ${invoice.client.phone}`    : ""}
          </Text>
        </View>

        {/* ── Salesperson | spacer | Due Date ── */}
        <View style={S.metaBar}>
          <View style={S.metaBarLeft}>
            <Text style={S.metaLbl800}>SALESPERSON</Text>
            <Text style={S.metaVal}>{invoice.salesperson}</Text>
          </View>
          <View style={S.metaBarSpacer} />
          <View style={S.metaBarRight}>
            <Text style={S.metaLbl700}>DUE DATE</Text>
            <Text style={S.metaVal}>{fmtDate(invoice.dueDate)}</Text>
          </View>
        </View>

        {/* ── Table column headers ── */}
        <View style={S.tableHeader}>
          <Text style={[S.thText, S.col1]}>ITEM</Text>
          <Text style={[S.thText, S.col2]}>UNIT PRICE (₦)</Text>
          <Text style={[S.thText, S.col3]}>QUANTITY</Text>
          <Text style={[S.thText, S.col4]}>LINE TOTAL (₦)</Text>
        </View>

        {/* ── Items table — outer border only, no row separators ── */}
        <View style={S.itemsTable}>
          {invoice.items.map((item) => (
            <View key={item.id} style={S.tableRow}>
              <Text style={[S.tdText, S.col1]}>{item.name}</Text>
              <Text style={[S.tdText, S.col2]}>{fmtNum(item.unitPrice)}</Text>
              <Text style={[S.tdText, S.col3]}>{String(item.quantity)}</Text>
              <Text style={[S.tdText, S.col4]}>{fmtNum(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        {/* Flex spacer — pushes bank + thank you + footer to page bottom */}
        <View style={{ flex: 1 }} />

        {/* ── Totals — right-aligned, 163px wide ── */}
        <View style={S.totalsSection}>
          <View style={S.totalsBox}>
            <View style={S.totalsRow}>
              <View style={S.totalsLblCell}><Text style={S.totalsLblTxt}>Subtotal</Text></View>
              <View style={S.totalsDivider} />
              <View style={S.totalsAmtCell}><Text style={S.totalsAmtTxt}>{fmtMoney(invoice.subtotal)}</Text></View>
            </View>
            <View style={S.totalsRow}>
              <View style={S.totalsLblCell}><Text style={S.totalsLblTxt}>VAT ({vatPct}%)</Text></View>
              <View style={S.totalsDivider} />
              <View style={S.totalsAmtCell}><Text style={S.totalsAmtTxt}>{fmtMoney(invoice.vatAmount)}</Text></View>
            </View>
            <View style={S.totalsRowLast}>
              <View style={S.totalsLblCell}><Text style={S.totalsLblTxt}>Total</Text></View>
              <View style={S.totalsDivider} />
              <View style={S.totalsAmtCell}><Text style={S.totalsAmtTxt}>{fmtMoney(invoice.total)}</Text></View>
            </View>
          </View>
        </View>

        {/* ── Bank details — 444px wide, left-aligned ── */}
        <View style={S.bankTable}>
          <View style={S.bankRowHdr}>
            <View style={S.bk1}><Text style={S.bankTh}>Account Name</Text></View>
            <View style={S.bk2}><Text style={S.bankTh}>Account Number</Text></View>
            <View style={S.bk3}><Text style={S.bankTh}>TIN Number</Text></View>
            <View style={S.bk4}><Text style={S.bankTh}>Bank Name</Text></View>
          </View>
          <View style={S.bankRowData}>
            <View style={S.bk1}><Text style={S.bankTd}>{COMPANY.bank.accountName}</Text></View>
            <View style={S.bk2}><Text style={S.bankTd}>{COMPANY.bank.account}</Text></View>
            <View style={S.bk3}><Text style={S.bankTd}>{COMPANY.bank.tin}</Text></View>
            <View style={S.bk4}><Text style={S.bankTd}>{COMPANY.bank.name}</Text></View>
          </View>
        </View>

        {/* ── Thank you ── */}
        <Text style={S.thankYou}>THANK YOU FOR YOUR BUSINESS!</Text>

        {/* ── Orange footer bar — full page width ── */}
        <View style={S.footer} />

      </Page>
    </Document>
  );
}
