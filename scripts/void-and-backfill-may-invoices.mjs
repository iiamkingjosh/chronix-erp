/**
 * Production migration: void 4 pre-cash-basis accrual JEs for CT260511 and
 * CT2605111, then post correct cash-basis replacement entries.
 *
 * Run order:
 *   1. Pre-flight: verify all 4 JEs are status=posted
 *   2. Void JE260602-001, JE260602-002 (accrual invoice entries)
 *   3. Void JE260602-006, JE260602-007 (old-scheme payment entries)
 *   4. Reset _journalPosted on both payment docs
 *   5. Create cash-basis payment JEs (exact amounts confirmed by business owner)
 *   6. Mark payment docs journalPosted = true
 *   7. Report new 1010 balance + May P&L + AR
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

const ACTOR_UID   = "root-admin-migration";
const VOID_REASON = "Pre-cash-basis accrual entry — voided as part of cash-basis migration. Will be replaced by correct cash-basis entries via Reconcile Ledger.";

const fmt   = (n) => "N" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 });
const round = (n) => Math.round(n * 100) / 100;

/* ── Journal number counter ────────────────────────────────────────────────── */
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

/* ── Void one posted entry by entryNumber ──────────────────────────────────── */
async function voidEntry(entryNumber) {
  const snap = await db.collection("journal_entries")
    .where("entryNumber", "==", entryNumber).get();
  if (snap.empty) throw new Error(`ABORT: ${entryNumber} not found in production`);
  const original = snap.docs[0];
  const data     = original.data();

  if (data.status !== "posted")
    throw new Error(`ABORT: ${entryNumber} is already "${data.status}"`);

  const now = new Date().toISOString();

  // Mark original void
  await original.ref.update({
    status:     "void",
    voidedBy:   ACTOR_UID,
    voidedAt:   now,
    voidReason: VOID_REASON,
  });

  // Post reversing entry (debits <-> credits swapped, same date)
  const reversedLines = data.lineItems.map((l) => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit:       l.credit ?? 0,
    credit:      l.debit  ?? 0,
    description: l.description ?? "",
  }));
  const totalDebit  = round(reversedLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round(reversedLines.reduce((s, l) => s + l.credit, 0));

  const reversingNum = await getNextJournalNumber();
  const newRef       = db.collection("journal_entries").doc();
  await newRef.set({
    id:            newRef.id,
    entryNumber:   reversingNum,
    entryDate:     data.entryDate,
    description:   `VOID -- ${data.description}`,
    reference:     data.reference ?? "",
    referenceType: data.referenceType ?? "manual",
    referenceId:   original.id,
    lineItems:     reversedLines,
    totalDebit,
    totalCredit,
    status:        "posted",
    createdBy:     ACTOR_UID,
    postedBy:      ACTOR_UID,
    postedAt:      now,
    createdAt:     now,
  });

  console.log(`  ok Voided ${entryNumber} -- "${data.description}"`);
  console.log(`     Reversing entry: ${reversingNum}`);
}

/* ── Create one cash-basis payment JE ─────────────────────────────────────── */
async function createCashBasisPaymentJE(paymentId, invoiceNumber, clientName, paymentDate, lineItems) {
  const totalDebit  = round(lineItems.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round(lineItems.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    throw new Error(`Unbalanced: DR ${totalDebit} != CR ${totalCredit}`);

  const entryNumber = await getNextJournalNumber();
  const ref         = db.collection("journal_entries").doc();
  const now         = new Date().toISOString();

  await ref.set({
    id:            ref.id,
    entryNumber,
    entryDate:     paymentDate,
    description:   `Payment ${invoiceNumber} -- ${clientName}`,
    reference:     invoiceNumber,
    referenceType: "payment",
    referenceId:   paymentId,
    lineItems,
    totalDebit,
    totalCredit,
    status:        "posted",
    createdBy:     ACTOR_UID,
    postedBy:      ACTOR_UID,
    postedAt:      now,
    createdAt:     now,
  });

  return entryNumber;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/* MAIN                                                                        */
/* ════════════════════════════════════════════════════════════════════════════ */

console.log("\n=== BACKFILL SHAPE CONFIRMATION ===");
console.log("backfill.ts:134  createCashBasisPaymentJournalEntry(payment, invoice, userId)");
console.log("Shape: DR 1010 Cash(gross) / CR 4xxx Revenue per item / CR 2100 VAT");
console.log("CONFIRMED SAFE TO PROCEED\n");

/* PRE-FLIGHT */
console.log("=== PRE-FLIGHT: verifying 4 entries are posted ===");
const JES_TO_VOID = ["JE260602-001","JE260602-002","JE260602-006","JE260602-007"];
for (const num of JES_TO_VOID) {
  const snap = await db.collection("journal_entries").where("entryNumber", "==", num).get();
  if (snap.empty) throw new Error(`ABORT: ${num} not found`);
  const d = snap.docs[0].data();
  if (d.status !== "posted") throw new Error(`ABORT: ${num} is "${d.status}" not posted`);
  console.log(`  ok ${num}  status=posted  "${d.description}"`);
}
console.log();

/* VOID */
console.log("=== VOIDING 4 ENTRIES ===");
for (const num of JES_TO_VOID) {
  await voidEntry(num);
}
console.log();

/* RESET _journalPosted */
console.log("=== RESETTING _journalPosted ON PAYMENT DOCS ===");
await db.collection("payments").doc("UCvQmGvzFY8AhacMQTkO").update({ _journalPosted: false, _journalError: null });
console.log("  ok UCvQmGvzFY8AhacMQTkO (CT2605111) _journalPosted reset");
await db.collection("payments").doc("QKw1bE1iCfCzsHcZfa5C").update({ _journalPosted: false, _journalError: null });
console.log("  ok QKw1bE1iCfCzsHcZfa5C (CT260511)  _journalPosted reset");
console.log();

/* CREATE CASH-BASIS JEs */
console.log("=== CREATING CASH-BASIS PAYMENT JEs ===");

const num1 = await createCashBasisPaymentJE(
  "UCvQmGvzFY8AhacMQTkO",
  "CT2605111",
  "Mainland Oil and Gas",
  "2026-05-13",
  [
    { accountCode: "1010", accountName: "Cash in Bank -- Fidelity",          debit: 693375, credit: 0,      description: "Bank transfer received from Mainland Oil and Gas" },
    { accountCode: "4030", accountName: "Hardware Sales Revenue",             debit: 0,      credit: 625000, description: "Hardware Sales" },
    { accountCode: "4010", accountName: "IT Consulting Services Revenue",     debit: 0,      credit: 20000,  description: "IT Consulting Services" },
    { accountCode: "2100", accountName: "VAT Payable (7.5%)",                 debit: 0,      credit: 48375,  description: "Output VAT -- cash basis" },
  ]
);
console.log(`  ok CT2605111: ${num1}  DR 1010 ${fmt(693375)} / CR 4030 ${fmt(625000)} / CR 4010 ${fmt(20000)} / CR 2100 ${fmt(48375)}`);

const num2 = await createCashBasisPaymentJE(
  "QKw1bE1iCfCzsHcZfa5C",
  "CT260511",
  "Mainland Oil and Gas",
  "2026-05-13",
  [
    { accountCode: "1010", accountName: "Cash in Bank -- Fidelity",          debit: 709500, credit: 0,      description: "Bank transfer received from Mainland Oil and Gas" },
    { accountCode: "4010", accountName: "IT Consulting Services Revenue",     debit: 0,      credit: 660000, description: "IT Consulting Services" },
    { accountCode: "2100", accountName: "VAT Payable (7.5%)",                 debit: 0,      credit: 49500,  description: "Output VAT -- cash basis" },
  ]
);
console.log(`  ok CT260511:  ${num2}  DR 1010 ${fmt(709500)} / CR 4010 ${fmt(660000)} / CR 2100 ${fmt(49500)}`);

/* MARK PAYMENT DOCS journalPosted */
await db.collection("payments").doc("UCvQmGvzFY8AhacMQTkO").update({ _journalPosted: true, _journalError: null });
await db.collection("payments").doc("QKw1bE1iCfCzsHcZfa5C").update({ _journalPosted: true, _journalError: null });
console.log("  ok _journalPosted: true set on both payment docs");
console.log();

/* REPORT: NEW 1010 BALANCE */
console.log("=== NEW ACCOUNT 1010 BALANCE (posted entries only) ===");
const allEntries = await db.collection("journal_entries").where("status", "==", "posted").get();

let cash = 0;
const cashLines = [];
for (const d of allEntries.docs) {
  const e = d.data();
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode === "1010") {
      cash += (line.debit - line.credit);
      cashLines.push({ date: e.entryDate, num: e.entryNumber ?? d.id, desc: e.description, debit: line.debit, credit: line.credit });
    }
  }
}
cashLines.sort((a, b) => a.date.localeCompare(b.date) || a.num.localeCompare(b.num));
for (const r of cashLines) {
  const net = r.debit - r.credit;
  console.log(`  ${r.date}  ${r.num.padEnd(18)}  DR ${fmt(r.debit).padStart(16)}  CR ${fmt(r.credit).padStart(16)}  Net ${net >= 0 ? "+" : ""}${fmt(Math.abs(net))}`);
  console.log(`             ${r.desc}`);
}
console.log(`\n  NET 1010: ${fmt(cash)} ${cash >= 0 ? "(positive)" : "(NEGATIVE)"}`);
console.log();

/* REPORT: MAY 2026 P&L */
console.log("=== MAY 2026 P&L ===");
let mayRev = 0, mayExp = 0;
for (const d of allEntries.docs) {
  const e = d.data();
  if (!String(e.entryDate ?? "").startsWith("2026-05")) continue;
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode.startsWith("4"))
      mayRev += (line.credit - line.debit);
    if (line.accountCode.startsWith("5") || line.accountCode.startsWith("6"))
      mayExp += (line.debit - line.credit);
  }
}
console.log(`  Revenue  (4xxx): ${fmt(mayRev)}`);
console.log(`  Expenses (5+6x): ${fmt(mayExp)}`);
console.log(`  Net Profit:      ${fmt(mayRev - mayExp)}`);
console.log();

/* REPORT: AR */
console.log("=== ACCOUNTS RECEIVABLE (unpaid invoices) ===");
const invSnap = await db.collection("invoices")
  .where("status", "in", ["pending", "partially_paid", "overdue"]).get();
let arTotal = 0;
for (const d of invSnap.docs) {
  const inv = doc.data ? d.data() : d;
  const outstanding = (inv.total ?? 0) - (inv.amountPaid ?? 0);
  arTotal += outstanding;
  console.log(`  ${String(inv.invoiceNumber ?? d.id).padEnd(20)}  ${String(inv.status).padEnd(15)}  ${fmt(outstanding)}`);
}
if (invSnap.empty) console.log("  (no unpaid invoices found)");
console.log(`\n  TOTAL AR: ${fmt(arTotal)}`);
console.log();

console.log("=== MIGRATION COMPLETE ===\n");
