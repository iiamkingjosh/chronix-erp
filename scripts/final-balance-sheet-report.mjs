/**
 * Balance sheet figures matching the updated generateBalanceSheet logic:
 * AR excluded from currentAssets.total (memo only).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";
import { readFileSync }        from "fs";
import { resolve, dirname }    from "path";
import { fileURLToPath }       from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(resolve(__dirname, "../config/chronix-erp-firebase-adminsdk-fbsvc-3ba562100b.json"), "utf8")
);
initializeApp({ credential: cert(sa), projectId: "chronix-erp" });
const db = getFirestore();

const fmt   = (n) => "N" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 });
const round = (n) => Math.round(n * 100) / 100;

const snap = await db.collection("journal_entries")
  .where("status", "in", ["posted", "void"]).get();
const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const bal = {};
for (const e of entries) {
  for (const line of (e.lineItems ?? [])) {
    bal[line.accountCode] = (bal[line.accountCode] ?? 0) + (line.debit - line.credit);
  }
}
const g = (code) => round(bal[code] ?? 0);

// Current year profit
let ytdRev = 0, ytdExp = 0;
for (const e of entries) {
  if (!String(e.entryDate ?? "").startsWith("2026")) continue;
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode.startsWith("4")) ytdRev  += (line.credit - line.debit);
    if (line.accountCode.startsWith("5") || line.accountCode.startsWith("6"))
      ytdExp += (line.debit - line.credit);
  }
}
const currentYearProfit = round(ytdRev - ytdExp);

// AR memo (not in total)
const invSnap = await db.collection("invoices")
  .where("status", "in", ["pending", "partially_paid", "overdue"]).get();
const arMemo = round(
  invSnap.docs.reduce((s, d) => {
    const inv = d.data();
    return s + Math.max(0, (inv.total ?? 0) - (inv.amountPaid ?? 0));
  }, 0)
);

// Assets — AR excluded from total
const cash        = g("1010");
const pettyCash   = g("1020");
const vatRec      = g("1110");
const inventory   = g("1200");
const prepaid     = g("1300");
const currentTotal = round(cash + pettyCash + vatRec + inventory + prepaid);
const fixedTotal   = round(g("1400") + g("1500"));
const totalAssets  = round(currentTotal + fixedTotal);

// Liabilities
const ap   = Math.max(0, -g("2010"));
const vat  = Math.max(0, -g("2100"));
const wht  = Math.max(0, -g("2200"));
const paye = Math.max(0, -g("2300"));
const dedn = Math.max(0, -g("2400"));
const totalLiab = round(ap + vat + wht + paye + dedn);

// Equity
const shareCapital     = round(-(g("3010") + g("3020") + g("3030")));
const retainedEarnings = round(-g("3100"));
const totalEquity      = round(shareCapital + retainedEarnings + currentYearProfit);

const totalLE  = round(totalLiab + totalEquity);
const balanced = Math.abs(totalAssets - totalLE) < 1;

console.log("\n=== BALANCE SHEET (as of 2026-07-02) ===\n");
console.log("  ASSETS — Current");
console.log(`    Cash in Bank          ${fmt(cash)}`);
console.log(`    Petty Cash            ${fmt(pettyCash)}`);
console.log(`    VAT Recoverable       ${fmt(vatRec)}`);
console.log(`    Inventory             ${fmt(inventory)}`);
console.log(`    Prepaid Expenses      ${fmt(prepaid)}`);
console.log(`    Total Current Assets  ${fmt(currentTotal)}`);
console.log(`    Fixed Assets          ${fmt(fixedTotal)}`);
console.log(`  TOTAL ASSETS            ${fmt(totalAssets)}`);
console.log();
console.log(`    (memo) A/R — unpaid invoices  ${fmt(arMemo)}  [not in total — cash-basis]`);
console.log();
console.log("  LIABILITIES");
console.log(`    Accounts Payable      ${fmt(ap)}`);
console.log(`    VAT Payable           ${fmt(vat)}`);
console.log(`    WHT Payable           ${fmt(wht)}`);
console.log(`    PAYE Payable          ${fmt(paye)}`);
console.log(`    Payroll Deductions    ${fmt(dedn)}`);
console.log(`  TOTAL LIABILITIES       ${fmt(totalLiab)}`);
console.log();
console.log("  EQUITY");
console.log(`    Share Capital         ${fmt(shareCapital)}`);
console.log(`    Retained Earnings     ${fmt(retainedEarnings)}`);
console.log(`    Current Year Profit   ${fmt(currentYearProfit)}`);
console.log(`  TOTAL EQUITY            ${fmt(totalEquity)}`);
console.log();
console.log(`  TOTAL L + E             ${fmt(totalLE)}`);
console.log();
console.log(`  BALANCED: ${balanced ? "YES - Assets = L+E" : "NO - difference: " + fmt(round(totalAssets - totalLE))}`);
console.log();
