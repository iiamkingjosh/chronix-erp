import {
  Document, Page, View, Text, StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice } from "@/types/finance";
import { COMPANY } from "@/types/finance";

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtMoney(n: number): string {
  const parts = n.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${parts.join(".")}`;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day}/${m}/${y}`;
}

/* ── Styles ──────────────────────────────────────────────────── */

const S = StyleSheet.create({
  page: {
    paddingTop: 28, paddingBottom: 0,
    paddingLeft: 40, paddingRight: 40,
    fontFamily: "Helvetica", fontSize: 10, color: "#111",
    display: "flex", flexDirection: "column",
  },

  /* Header */
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  invoiceTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, textTransform: "uppercase" },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },
  companyAddress: { fontSize: 9.5, color: "#222", lineHeight: 1.55, textAlign: "right" },

  /* Invoice meta (date / number) */
  metaRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12 },
  metaDate: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a5fb4" },
  metaNumberBlock: { position: "absolute", left: "50%", transform: "translateX(-50%)", alignItems: "center" },
  metaNumberLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.7, color: "#111" },
  metaNumberValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a5fb4" },

  /* Invoice To */
  invoiceTo: { marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  toText: { fontSize: 10, color: "#222", lineHeight: 1.55 },

  /* Meta bar */
  metaBar: { flexDirection: "row", border: "2px solid #aaa", marginBottom: 12 },
  metaCell: { flex: 1, padding: "5 10" },
  metaCellLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, color: "#1a5fb4", marginBottom: 2 },
  metaCellValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#222" },

  /* Table header */
  tableColHeader: { flexDirection: "row", borderBottom: "2.5px solid #111", paddingBottom: 5, marginBottom: 5 },
  thText: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },

  /* Table rows */
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  tdText: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#111" },

  /* Column widths */
  colName:    { flex: 1 },
  colPrice:   { width: 110, textAlign: "right" },
  colQty:     { width: 55, textAlign: "center" },
  colTotal:   { width: 100, textAlign: "right" },

  /* Items wrapper */
  itemsWrapper: { border: "2px solid #999", marginBottom: 0 },

  /* Totals */
  totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 },
  totalsBox: { width: 240, border: "2px solid #999", borderTop: "none" },
  totalsLine: { flexDirection: "row", borderBottom: "1px solid #ddd" },
  totalsLineLast: { flexDirection: "row" },
  totalsLabel: { flex: 1, padding: "5 12", fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#111" },
  totalsAmt: { padding: "5 12", fontSize: 10.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  totalsDivider: { width: 2, backgroundColor: "#999" },

  /* Bank table */
  bankTable: { border: "2px solid #999", marginBottom: 0 },
  bankRow: { flexDirection: "row" },
  bankCell: { flex: 1, padding: "5 10", borderRight: "2px solid #999" },
  bankCellLast: { flex: 1, padding: "5 10" },
  bankTh: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a5fb4", textTransform: "uppercase", marginBottom: 2 },
  bankTd: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#222" },

  /* Notes */
  notes: { marginBottom: 6, padding: "6 10", fontSize: 9.5, color: "#334155", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" },

  /* Thank you */
  thankYou: { fontSize: 18, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, textAlign: "center", paddingVertical: 12 },

  /* Footer bar */
  footerBar: { backgroundColor: "#e85d04", height: 20, marginLeft: -40, marginRight: -40, marginTop: "auto" },
});

/* ── Component ───────────────────────────────────────────────── */

export function InvoicePDFDocument({ invoice }: { invoice: Invoice }) {
  const fmt = fmtMoney;

  return (
    <Document
      title={`Invoice ${invoice.invoiceNumber}`}
      author={COMPANY.name}
      subject={`Invoice to ${invoice.client.name}`}
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <Text style={S.invoiceTitle}>Invoice</Text>
          <View style={S.companyBlock}>
            <Text style={S.companyName}>{COMPANY.name}</Text>
            <Text style={S.companyAddress}>
              {COMPANY.address}{"\n"}
              {COMPANY.phone}{"\n"}
              {COMPANY.website}{"\n"}
              {COMPANY.email}
            </Text>
          </View>
        </View>

        {/* ── Invoice meta row (date | number) ── */}
        <View style={S.metaRow}>
          <Text style={S.metaDate}>{fmtDate(invoice.invoiceDate)}</Text>
          <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Text style={S.metaNumberLabel}>Invoice No</Text>
            <Text style={S.metaNumberValue}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        {/* ── Invoice To ── */}
        <View style={S.invoiceTo}>
          <Text style={S.sectionTitle}>Invoice To</Text>
          <Text style={S.toText}>
            {invoice.client.name}
            {invoice.client.address ? `\nAddress: ${invoice.client.address}` : ""}
            {invoice.client.phone ? `\nPhone: ${invoice.client.phone}` : ""}
          </Text>
        </View>

        {/* ── Meta bar (Salesperson | Due Date) ── */}
        <View style={S.metaBar}>
          <View style={[S.metaCell, { borderRight: "2px solid #aaa" }]}>
            <Text style={S.metaCellLabel}>Salesperson</Text>
            <Text style={S.metaCellValue}>{invoice.salesperson}</Text>
          </View>
          <View style={S.metaCell} />
          <View style={[S.metaCell, { borderLeft: "2px solid #aaa", alignItems: "flex-end" }]}>
            <Text style={S.metaCellLabel}>Due Date</Text>
            <Text style={S.metaCellValue}>{fmtDate(invoice.dueDate)}</Text>
          </View>
        </View>

        {/* ── Table header ── */}
        <View style={S.tableColHeader}>
          <Text style={[S.thText, S.colName]}>Item</Text>
          <Text style={[S.thText, S.colPrice]}>Unit Price (₦)</Text>
          <Text style={[S.thText, S.colQty]}>Qty</Text>
          <Text style={[S.thText, S.colTotal]}>Line Total (₦)</Text>
        </View>

        {/* ── Items ── */}
        <View style={S.itemsWrapper}>
          {invoice.items.map((item) => (
            <View key={item.id} style={S.tableRow}>
              <Text style={[S.tdText, S.colName]}>{item.name}</Text>
              <Text style={[S.tdText, S.colPrice]}>{item.unitPrice.toLocaleString("en-NG")}</Text>
              <Text style={[S.tdText, S.colQty]}>{item.quantity}</Text>
              <Text style={[S.tdText, S.colTotal]}>{item.lineTotal.toLocaleString("en-NG")}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={S.totalsSection}>
          <View style={S.totalsBox}>
            <View style={S.totalsLine}>
              <Text style={S.totalsLabel}>Subtotal</Text>
              <View style={S.totalsDivider} />
              <Text style={S.totalsAmt}>{fmt(invoice.subtotal)}</Text>
            </View>
            <View style={S.totalsLine}>
              <Text style={S.totalsLabel}>VAT ({((invoice.vatRate ?? 0.075) * 100).toFixed(1)}%)</Text>
              <View style={S.totalsDivider} />
              <Text style={S.totalsAmt}>{fmt(invoice.vatAmount)}</Text>
            </View>
            <View style={S.totalsLineLast}>
              <Text style={[S.totalsLabel, { fontFamily: "Helvetica-Bold" }]}>Total</Text>
              <View style={S.totalsDivider} />
              <Text style={[S.totalsAmt, { fontFamily: "Helvetica-Bold" }]}>{fmt(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── Bank details ── */}
        <View style={S.bankTable}>
          <View style={[S.bankRow, { backgroundColor: "#f5f5f5" }]}>
            {[
              { label: "Account Name", value: COMPANY.bank.accountName, last: false },
              { label: "Account Number", value: COMPANY.bank.account, last: false },
              { label: "TIN Number", value: COMPANY.bank.tin, last: false },
              { label: "Bank Name", value: COMPANY.bank.name, last: true },
            ].map((cell) => (
              <View key={cell.label} style={cell.last ? S.bankCellLast : S.bankCell}>
                <Text style={S.bankTh}>{cell.label}</Text>
                <Text style={S.bankTd}>{cell.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Notes ── */}
        {invoice.notes && (
          <View style={S.notes}>
            <Text><Text style={{ fontFamily: "Helvetica-Bold" }}>Notes: </Text>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Thank you ── */}
        <Text style={S.thankYou}>Thank You For Your Business!</Text>

        {/* ── Orange footer bar ── */}
        <View style={S.footerBar} />
      </Page>
    </Document>
  );
}
