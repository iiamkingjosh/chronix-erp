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

const ACTOR_UID = "root-admin-migration";
const fmt   = (n) => "N" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 });
const round = (n) => Math.round(n * 100) / 100;

/* ── Counter ── */
async function getNextJournalNumber() {
  const today  = new Date();
  const yy     = String(today.getFullYear()).slice(2);
  const mm     = String(today.getMonth() + 1).padStart(2, "0");
  const dd     = String(today.getDate()).padStart(2, "0");
  const prefix = `${yy}${mm}${dd}`;
  const ref    = db.collection("metadata").doc(`journalCounter_${prefix}`);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { lastNumber: 1, date: prefix, createdAt: new Date(), lastUpdatedAt: new Date() });
      return 1;
    }
    const next = snap.data().lastNumber + 1;
    tx.update(ref, { lastNumber: next, lastUpdatedAt: new Date() });
    return next;
  });
  return `JE${prefix}-${String(n).padStart(3, "0")}`;
}

/* ── Post the opening balance entry ── */
const now         = new Date().toISOString();
const entryNumber = await getNextJournalNumber();
const ref         = db.collection("journal_entries").doc();

await ref.set({
  id:            ref.id,
  entryNumber,
  entryDate:     "2026-05-01",
  description:   "Opening cash balance — Fidelity Bank account (reconciled to current bank balance 2026-07-02, working backwards from N18,553 actual balance)",
  reference:     "",
  referenceType: "manual",
  referenceId:   "",
  lineItems: [
    { accountCode: "1010", accountName: "Cash in Bank — Fidelity", debit: 91223.98, credit: 0,        description: "Opening cash balance" },
    { accountCode: "3100", accountName: "Retained Earnings",        debit: 0,        credit: 91223.98, description: "Opening cash balance counterpart" },
  ],
  totalDebit:  91223.98,
  totalCredit: 91223.98,
  status:      "posted",
  createdBy:   ACTOR_UID,
  postedBy:    ACTOR_UID,
  postedAt:    now,
  createdAt:   now,
});

console.log(`\n  ok ${entryNumber} posted`);
console.log(`     DR 1010  ${fmt(91223.98)}`);
console.log(`     CR 3100  ${fmt(91223.98)}`);
console.log();

/* ── Pull all posted+void entries and compute balances ── */
const snap = await db.collection("journal_entries")
  .where("status", "in", ["posted", "void"])
  .get();

const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const bal = {};
for (const e of entries) {
  for (const line of (e.lineItems ?? [])) {
    bal[line.accountCode] = (bal[line.accountCode] ?? 0) + (line.debit - line.credit);
  }
}
const g = (code) => round(bal[code] ?? 0);

/* ── 1. Confirm 1010 ── */
const cash1010 = g("1010");
console.log("=== 1. ACCOUNT 1010 CONFIRMATION ===");
console.log(`  Net 1010 Cash in Bank: ${fmt(cash1010)}`);
console.log(`  Expected:              ${fmt(18553)} (approx)`);
console.log(`  Match: ${Math.abs(cash1010 - 18553) < 1 ? "YES" : "NO — check"}`);
console.log();

/* ── 2+3. Balance sheet figures ── */
// Current-year profit
const currentYear = "2026";
let ytdRev = 0, ytdExp = 0;
for (const e of entries) {
  if (!String(e.entryDate ?? "").startsWith(currentYear)) continue;
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode.startsWith("4")) ytdRev  += (line.credit - line.debit);
    if (line.accountCode.startsWith("5") || line.accountCode.startsWith("6"))
      ytdExp += (line.debit - line.credit);
  }
}
const currentYearProfit = round(ytdRev - ytdExp);

// Assets
const currentAssetsCash        = g("1010");
const currentAssetsPettyCash   = g("1020");
// AR from invoices collection (Change C)
const invSnap = await db.collection("invoices")
  .where("status", "in", ["pending", "partially_paid", "overdue"]).get();
const arFromInvoices = round(
  invSnap.docs.reduce((s, d) => {
    const inv = d.data();
    return s + Math.max(0, (inv.total ?? 0) - (inv.amountPaid ?? 0));
  }, 0)
);
const currentAssetsVATRec      = g("1110");
const currentAssetsInventory   = g("1200");
const currentAssetsPrepaid     = g("1300");
const currentAssetsTotal = round(
  currentAssetsCash + currentAssetsPettyCash + arFromInvoices +
  currentAssetsVATRec + currentAssetsInventory + currentAssetsPrepaid
);
const fixedAssetsOffice   = g("1400");
const fixedAssetsComputer = g("1500");
const fixedAssetsTotal    = round(fixedAssetsOffice + fixedAssetsComputer);
const totalAssets         = round(currentAssetsTotal + fixedAssetsTotal);

// Liabilities
const apRaw   = -g("2010");
const vatRaw  = -g("2100");
const whtRaw  = -g("2200");
const payeRaw = -g("2300");
const dednRaw = -g("2400");
const liabTotal = round(
  Math.max(0, apRaw) + Math.max(0, vatRaw) + Math.max(0, whtRaw) +
  Math.max(0, payeRaw) + Math.max(0, dednRaw)
);

// Equity
const shareCapital     = round(-(g("3010") + g("3020") + g("3030")));
const retainedEarnings = round(-g("3100"));
const equityTotal      = round(shareCapital + retainedEarnings + currentYearProfit);

const totalLE  = round(liabTotal + equityTotal);
const balanced = Math.abs(totalAssets - totalLE) < 1;

console.log("=== 2+3. BALANCE SHEET FIGURES ===");
console.log();
console.log("  ASSETS");
console.log(`    Cash in Bank           ${fmt(currentAssetsCash)}`);
console.log(`    Petty Cash             ${fmt(currentAssetsPettyCash)}`);
console.log(`    Accounts Receivable    ${fmt(arFromInvoices)}  (from unpaid invoices)`);
console.log(`    VAT Recoverable        ${fmt(currentAssetsVATRec)}`);
console.log(`    Inventory              ${fmt(currentAssetsInventory)}`);
console.log(`    Prepaid Expenses       ${fmt(currentAssetsPrepaid)}`);
console.log(`    Total Current Assets   ${fmt(currentAssetsTotal)}`);
console.log(`    Fixed Assets           ${fmt(fixedAssetsTotal)}`);
console.log(`  TOTAL ASSETS             ${fmt(totalAssets)}`);
console.log();
console.log("  LIABILITIES");
console.log(`    Accounts Payable       ${fmt(Math.max(0, apRaw))}`);
console.log(`    VAT Payable            ${fmt(Math.max(0, vatRaw))}`);
console.log(`    WHT Payable            ${fmt(Math.max(0, whtRaw))}`);
console.log(`    PAYE Payable           ${fmt(Math.max(0, payeRaw))}`);
console.log(`    Payroll Deductions     ${fmt(Math.max(0, dednRaw))}`);
console.log(`  TOTAL LIABILITIES        ${fmt(liabTotal)}`);
console.log();
console.log("  EQUITY");
console.log(`    Share Capital          ${fmt(shareCapital)}`);
console.log(`    Retained Earnings      ${fmt(retainedEarnings)}`);
console.log(`    Current Year Profit    ${fmt(currentYearProfit)}`);
console.log(`  TOTAL EQUITY             ${fmt(equityTotal)}`);
console.log();
console.log(`  TOTAL L + E              ${fmt(totalLE)}`);
console.log();
console.log(`  BALANCED: ${balanced ? "YES" : "NO"}`);
if (!balanced) console.log(`  Difference: ${fmt(round(totalAssets - totalLE))}`);
console.log();
