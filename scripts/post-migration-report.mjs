/**
 * Post-migration diagnostic — queries both posted AND void entries,
 * matching exactly what generateBalanceSheet / P&L report use.
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

// Replicate getJournalEntriesByDateRange: status IN [posted, void]
const allSnap = await db.collection("journal_entries")
  .where("status", "in", ["posted", "void"])
  .get();

const entries = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

/* ── 1010 Cash balance (same logic as generateBalanceSheet) ─────────────── */
const bal = {};
for (const e of entries) {
  for (const line of (e.lineItems ?? [])) {
    bal[line.accountCode] = (bal[line.accountCode] ?? 0) + (line.debit - line.credit);
  }
}

console.log("\n=== ACCOUNT 1010 BALANCE (posted + void — matches balance sheet) ===");
console.log(`  Net 1010 Cash in Bank: ${fmt(round(bal["1010"] ?? 0))}`);
console.log();

/* ── Show individual 1010 lines (both posted and void) ─────────────────── */
const cashLines = [];
for (const e of entries) {
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode === "1010") {
      cashLines.push({ date: e.entryDate, num: e.entryNumber ?? e.id, status: e.status, desc: e.description, debit: line.debit ?? 0, credit: line.credit ?? 0 });
    }
  }
}
cashLines.sort((a, b) => a.date.localeCompare(b.date) || a.num.localeCompare(b.num));

console.log("=== EVERY 1010 LINE ITEM (both posted and void) ===");
let running = 0;
for (const r of cashLines) {
  running += (r.debit - r.credit);
  const net = r.debit - r.credit;
  const tag = r.status === "void" ? "[VOID]  " : "[posted]";
  console.log(`  ${r.date}  ${tag}  ${r.num.padEnd(18)}  DR ${fmt(r.debit).padStart(14)}  CR ${fmt(r.credit).padStart(14)}  Net ${net >= 0 ? "+" : ""}${fmt(Math.abs(net)).padStart(14)}  Running ${fmt(round(running)).padStart(14)}`);
  console.log(`           ${r.desc}`);
}
console.log(`\n  NET (all): ${fmt(round(running))} ${round(running) >= 0 ? "(positive)" : "(NEGATIVE)"}`);
console.log();

/* ── May 2026 P&L (posted + void — matches P&L report) ─────────────────── */
let mayRev = 0, mayExp = 0;
for (const e of entries) {
  if (!String(e.entryDate ?? "").startsWith("2026-05")) continue;
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode.startsWith("4"))
      mayRev += (line.credit - line.debit);
    if (line.accountCode.startsWith("5") || line.accountCode.startsWith("6"))
      mayExp += (line.debit - line.credit);
  }
}

console.log("=== MAY 2026 P&L (posted + void — matches reports) ===");
console.log(`  Revenue  (4xxx): ${fmt(round(mayRev))}`);
console.log(`  Expenses (5+6x): ${fmt(round(mayExp))}`);
console.log(`  Net Profit:      ${fmt(round(mayRev - mayExp))}`);
console.log();

/* ── Key account balances for balance sheet ─────────────────────────────── */
console.log("=== KEY ACCOUNT BALANCES (posted + void) ===");
const accounts = {
  "1010": "Cash in Bank",
  "1100": "Accounts Receivable",
  "2100": "VAT Payable",
  "2200": "WHT Payable",
  "2300": "PAYE Payable",
  "2400": "Payroll Deductions Payable",
  "4010": "IT Consulting Revenue",
  "4030": "Hardware Sales Revenue",
};
for (const [code, name] of Object.entries(accounts)) {
  const b = round(bal[code] ?? 0);
  if (b !== 0) {
    console.log(`  ${code}  ${name.padEnd(35)}  ${fmt(b)}`);
  }
}
console.log();

/* ── AR from invoices collection ────────────────────────────────────────── */
console.log("=== ACCOUNTS RECEIVABLE (from invoices collection) ===");
const invSnap = await db.collection("invoices")
  .where("status", "in", ["pending", "partially_paid", "overdue"]).get();
let arTotal = 0;
for (const d of invSnap.docs) {
  const inv = d.data();
  const outstanding = round((inv.total ?? 0) - (inv.amountPaid ?? 0));
  arTotal += outstanding;
  console.log(`  ${String(inv.invoiceNumber ?? d.id).padEnd(22)}  ${String(inv.status).padEnd(15)}  outstanding: ${fmt(outstanding)}`);
}
if (invSnap.empty) console.log("  (no unpaid invoices)");
console.log(`\n  TOTAL AR: ${fmt(round(arTotal))}`);
console.log();

/* ── Verify void/reversal pairs are correct ─────────────────────────────── */
console.log("=== VOID OPERATION VERIFICATION ===");
const voidedNums = ["JE260602-001","JE260602-002","JE260602-006","JE260602-007"];
for (const num of voidedNums) {
  const e = entries.find(x => x.entryNumber === num);
  if (!e) { console.log(`  MISSING: ${num}`); continue; }
  console.log(`  ${num}  status=${e.status}  "${e.description}"`);
}
const newNums = ["JE260702-005","JE260702-006","JE260702-007","JE260702-008","JE260702-009","JE260702-010"];
for (const num of newNums) {
  const e = entries.find(x => x.entryNumber === num);
  if (!e) { console.log(`  MISSING: ${num}`); continue; }
  const dr = round(e.lineItems?.reduce((s, l) => s + (l.debit ?? 0), 0));
  const cr = round(e.lineItems?.reduce((s, l) => s + (l.credit ?? 0), 0));
  const type = num >= "JE260702-009" ? "CASH-BASIS" : "REVERSAL ";
  console.log(`  ${num}  ${type}  status=${e.status}  DR=${fmt(dr)} CR=${fmt(cr)}  "${e.description}"`);
}
console.log();
console.log("=== REPORT COMPLETE ===\n");
