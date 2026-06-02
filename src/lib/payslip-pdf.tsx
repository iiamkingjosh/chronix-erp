import {
  Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { PayslipSummary } from "@/types/hr";
import { MONTHS } from "@/types/hr";

const BRAND_BLUE   = "#003366";
const BRAND_ORANGE = "#FF761B";

const S = StyleSheet.create({
  page:          { padding: 40, fontFamily: "Helvetica", backgroundColor: "#ffffff", fontSize: 10 },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo:          { width: 90, height: 36, objectFit: "contain" },
  rightHeader:   { alignItems: "flex-end" },
  bigTitle:      { fontSize: 22, fontFamily: "Helvetica-Bold", color: BRAND_BLUE },
  statusLabel:   { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 4 },
  coName:        { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND_BLUE },
  coDetail:      { fontSize: 8, color: "#666666", marginTop: 2 },
  divider:       { borderBottomWidth: 2, borderBottomColor: BRAND_ORANGE, marginVertical: 12 },
  thinLine:      { borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0", marginVertical: 8 },
  row2:          { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  col:           { flex: 1 },
  colRight:      { flex: 1, alignItems: "flex-end" },
  lbl:           { fontSize: 8, color: "#888888", textTransform: "uppercase", marginBottom: 2 },
  val:           { fontSize: 10, color: "#1a1a1a" },
  secTitle:      { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND_BLUE, textTransform: "uppercase", marginBottom: 5, marginTop: 8 },
  tableRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  tLabel:        { fontSize: 10, color: "#333333" },
  tValue:        { fontSize: 10, color: "#333333" },
  totalsRow:     { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: "#cccccc", marginTop: 2 },
  netRow:        { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1.5, borderTopColor: BRAND_BLUE, marginTop: 6 },
  netLabel:      { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND_BLUE },
  netValue:      { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND_BLUE },
  footer:        { marginTop: 24, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: "#e0e0e0" },
  footerText:    { fontSize: 8, color: "#aaaaaa", textAlign: "center" },
});

function naira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** One payslip per page — used by the single-month download route. */
export function PayslipPDFDocument({
  summary,
  logoSrc,
}: {
  summary:  PayslipSummary;
  logoSrc?: { data: Buffer; format: "png" | "jpg" };
}): ReactElement<DocumentProps> {
  const period   = `${MONTHS[summary.month - 1]} ${summary.year}`;
  const deductionItems = summary.deductionItems ?? [
    { label: "PAYE (Income Tax)",  amount: summary.payeAmount },
    ...(summary.deductions > 0 ? [{ label: "Other Deductions", amount: summary.deductions }] : []),
  ];
  const totalDed = deductionItems.reduce((s, d) => s + d.amount, 0);
  const isPaid   = summary.status === "paid";

  return (
    <Document title={`Payslip — ${period}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoSrc && <Image src={logoSrc} style={S.logo} />}
            <Text style={S.coName}>Chronix Technology Limited</Text>
            <Text style={S.coDetail}>No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos</Text>
            <Text style={S.coDetail}>Info@chronixtechnology.com</Text>
          </View>
          <View style={S.rightHeader}>
            <Text style={S.bigTitle}>PAYSLIP</Text>
            <Text style={[S.statusLabel, { color: isPaid ? "#16a34a" : "#d97706" }]}>
              {isPaid ? "PAID" : "PENDING"}
            </Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* Employee + Period */}
        <View style={S.row2}>
          <View style={S.col}>
            <Text style={S.lbl}>Employee</Text>
            <Text style={S.val}>{summary.employeeName}</Text>
            <Text style={[S.lbl, { marginTop: 6 }]}>Role</Text>
            <Text style={S.val}>{summary.employeeRole}</Text>
            <Text style={[S.lbl, { marginTop: 6 }]}>Department</Text>
            <Text style={S.val}>{summary.employeeDepartment || "—"}</Text>
            {summary.employeeNumber && (
              <>
                <Text style={[S.lbl, { marginTop: 6 }]}>Employee No.</Text>
                <Text style={S.val}>{summary.employeeNumber}</Text>
              </>
            )}
          </View>
          <View style={S.colRight}>
            <Text style={S.lbl}>Pay Period</Text>
            <Text style={S.val}>{period}</Text>
            <Text style={[S.lbl, { marginTop: 6 }]}>Reference</Text>
            <Text style={S.val}>{summary.referenceNumber}</Text>
            {isPaid && summary.paidAt && (
              <>
                <Text style={[S.lbl, { marginTop: 6 }]}>Payment Date</Text>
                <Text style={S.val}>{fmtDate(summary.paidAt)}</Text>
              </>
            )}
          </View>
        </View>

        <View style={S.thinLine} />

        {/* Earnings */}
        <Text style={S.secTitle}>Earnings</Text>
        <View style={S.tableRow}>
          <Text style={S.tLabel}>Gross Salary</Text>
          <Text style={S.tValue}>{naira(summary.baseSalary)}</Text>
        </View>

        <View style={S.thinLine} />

        {/* Deductions */}
        <Text style={S.secTitle}>Deductions</Text>
        {deductionItems.map((item) => (
          <View key={item.label} style={S.tableRow}>
            <Text style={S.tLabel}>{item.label}</Text>
            <Text style={S.tValue}>{`−${naira(item.amount)}`}</Text>
          </View>
        ))}
        <View style={S.totalsRow}>
          <Text style={[S.tLabel, { fontFamily: "Helvetica-Bold" }]}>Total Deductions</Text>
          <Text style={[S.tValue, { fontFamily: "Helvetica-Bold" }]}>{`−${naira(totalDed)}`}</Text>
        </View>

        {/* Employer Pension (informational — not a deduction from employee) */}
        {(summary.employeePension ?? 0) > 0 && (
          <>
            <View style={S.thinLine} />
            <Text style={[S.secTitle, { color: "#888888" }]}>Employer Contributions (for reference)</Text>
            <View style={S.tableRow}>
              <Text style={[S.tLabel, { color: "#888888" }]}>Employer Pension (10%)</Text>
              <Text style={[S.tValue, { color: "#888888" }]}>{naira(Math.round((summary.employeePension ?? 0) * (10 / 8)))}</Text>
            </View>
          </>
        )}

        {/* Net Pay */}
        <View style={S.netRow}>
          <Text style={S.netLabel}>NET PAY</Text>
          <Text style={S.netValue}>{naira(summary.netPay)}</Text>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            {isPaid && summary.paidAt
              ? `Paid on ${fmtDate(summary.paidAt)}`
              : "Payment pending"}
          </Text>
          <Text style={[S.footerText, { marginTop: 4 }]}>
            This payslip is generated electronically and is valid without a signature.
          </Text>
        </View>

      </Page>
    </Document>
  );
}

/** Multiple payslips compiled into one PDF — one page per month. */
export function BulkPayslipPDFDocument({
  summaries,
  logoSrc,
}: {
  summaries: PayslipSummary[];
  logoSrc?:  { data: Buffer; format: "png" | "jpg" };
}): ReactElement<DocumentProps> {
  const sorted = [...summaries].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  const first  = sorted[0];
  const last   = sorted[sorted.length - 1];
  const range  = first && last
    ? `${MONTHS[first.month - 1]} ${first.year} – ${MONTHS[last.month - 1]} ${last.year}`
    : "";

  return (
    <Document title={`Compiled Payslip — ${range}`}>
      {sorted.map((summary) => {
        const period   = `${MONTHS[summary.month - 1]} ${summary.year}`;
        const bulkDeductionItems = summary.deductionItems ?? [
          { label: "PAYE (Income Tax)",  amount: summary.payeAmount },
          ...(summary.deductions > 0 ? [{ label: "Other Deductions", amount: summary.deductions }] : []),
        ];
        const totalDed = bulkDeductionItems.reduce((s, d) => s + d.amount, 0);
        const isPaid   = summary.status === "paid";

        return (
          <Page key={`${summary.year}-${summary.month}`} size="A4" style={S.page}>

            {/* Header */}
            <View style={S.header}>
              <View>
                {logoSrc && <Image src={logoSrc} style={S.logo} />}
                <Text style={S.coName}>Chronix Technology Limited</Text>
                <Text style={S.coDetail}>No.7 Jerry Iriabe Street, Lekki Phase 1, Lagos</Text>
                <Text style={S.coDetail}>Info@chronixtechnology.com</Text>
              </View>
              <View style={S.rightHeader}>
                <Text style={S.bigTitle}>PAYSLIP</Text>
                <Text style={[S.statusLabel, { color: isPaid ? "#16a34a" : "#d97706" }]}>
                  {isPaid ? "PAID" : "PENDING"}
                </Text>
              </View>
            </View>

            <View style={S.divider} />

            {/* Employee + Period */}
            <View style={S.row2}>
              <View style={S.col}>
                <Text style={S.lbl}>Employee</Text>
                <Text style={S.val}>{summary.employeeName}</Text>
                <Text style={[S.lbl, { marginTop: 6 }]}>Role</Text>
                <Text style={S.val}>{summary.employeeRole}</Text>
                <Text style={[S.lbl, { marginTop: 6 }]}>Department</Text>
                <Text style={S.val}>{summary.employeeDepartment || "—"}</Text>
                {summary.employeeNumber && (
                  <>
                    <Text style={[S.lbl, { marginTop: 6 }]}>Employee No.</Text>
                    <Text style={S.val}>{summary.employeeNumber}</Text>
                  </>
                )}
              </View>
              <View style={S.colRight}>
                <Text style={S.lbl}>Pay Period</Text>
                <Text style={S.val}>{period}</Text>
                <Text style={[S.lbl, { marginTop: 6 }]}>Reference</Text>
                <Text style={S.val}>{summary.referenceNumber}</Text>
                {isPaid && summary.paidAt && (
                  <>
                    <Text style={[S.lbl, { marginTop: 6 }]}>Payment Date</Text>
                    <Text style={S.val}>{fmtDate(summary.paidAt)}</Text>
                  </>
                )}
              </View>
            </View>

            <View style={S.thinLine} />

            {/* Earnings */}
            <Text style={S.secTitle}>Earnings</Text>
            <View style={S.tableRow}>
              <Text style={S.tLabel}>Gross Salary</Text>
              <Text style={S.tValue}>{naira(summary.baseSalary)}</Text>
            </View>

            <View style={S.thinLine} />

            {/* Deductions */}
            <Text style={S.secTitle}>Deductions</Text>
            {bulkDeductionItems.map((item) => (
              <View key={item.label} style={S.tableRow}>
                <Text style={S.tLabel}>{item.label}</Text>
                <Text style={S.tValue}>{`−${naira(item.amount)}`}</Text>
              </View>
            ))}
            <View style={S.totalsRow}>
              <Text style={[S.tLabel, { fontFamily: "Helvetica-Bold" }]}>Total Deductions</Text>
              <Text style={[S.tValue, { fontFamily: "Helvetica-Bold" }]}>{`−${naira(totalDed)}`}</Text>
            </View>

            {(summary.employeePension ?? 0) > 0 && (
              <>
                <View style={S.thinLine} />
                <Text style={[S.secTitle, { color: "#888888" }]}>Employer Contributions (for reference)</Text>
                <View style={S.tableRow}>
                  <Text style={[S.tLabel, { color: "#888888" }]}>Employer Pension (10%)</Text>
                  <Text style={[S.tValue, { color: "#888888" }]}>{naira(Math.round((summary.employeePension ?? 0) * (10 / 8)))}</Text>
                </View>
              </>
            )}

            {/* Net Pay */}
            <View style={S.netRow}>
              <Text style={S.netLabel}>NET PAY</Text>
              <Text style={S.netValue}>{naira(summary.netPay)}</Text>
            </View>

            {/* Footer */}
            <View style={S.footer}>
              <Text style={S.footerText}>
                {isPaid && summary.paidAt ? `Paid on ${fmtDate(summary.paidAt)}` : "Payment pending"}
              </Text>
              <Text style={[S.footerText, { marginTop: 4 }]}>
                Compiled statement · {range} · Generated electronically, valid without a signature.
              </Text>
            </View>

          </Page>
        );
      })}
    </Document>
  );
}
