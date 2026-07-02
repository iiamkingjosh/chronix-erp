import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(resolve(__dirname, "../config/chronix-erp-firebase-adminsdk-fbsvc-3ba562100b.json"), "utf8"));

initializeApp({ credential: cert(sa), projectId: "chronix-erp" });
const db = getFirestore();

const snap = await db.collection("journal_entries")
  .where("status", "==", "posted")
  .get();

// Collect every line item that touches 1010
const rows = [];
for (const doc of snap.docs) {
  const e = doc.data();
  for (const line of (e.lineItems ?? [])) {
    if (line.accountCode === "1010") {
      rows.push({
        date:        e.entryDate,
        entryNumber: e.entryNumber ?? doc.id,
        description: e.description,
        lineDesc:    line.description ?? "",
        referenceId: e.referenceId ?? "",
        debit:       line.debit  ?? 0,
        credit:      line.credit ?? 0,
      });
    }
  }
}

// Sort by date ascending
rows.sort((a, b) => a.date.localeCompare(b.date));

console.log("\n=== Account 1010 — Cash in Bank : all posted line items ===\n");
let runningBal = 0;
const fmt = (n) => n === 0 ? "—" : `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
for (const r of rows) {
  runningBal += r.debit - r.credit;
  const net = r.debit - r.credit;
  console.log(`${r.date}  ${r.entryNumber.padEnd(20)}  DR ${fmt(r.debit).padStart(16)}  CR ${fmt(r.credit).padStart(16)}  Net ${net >= 0 ? "+" : ""}${fmt(Math.abs(net)).padStart(16)}  Running ${fmt(runningBal).padStart(16)}`);
  console.log(`           Desc: ${r.description}`);
  if (r.referenceId) console.log(`           Ref:  ${r.referenceId}`);
  console.log();
}

console.log(`\n=== NET BALANCE of 1010 across ${rows.length} line item(s): ${fmt(runningBal)} ===\n`);

// Specifically look for CT2605111 and CT260511 payment entries
console.log("=== Searching for payment entries linked to CT2605111 and CT260511 ===\n");
for (const doc of snap.docs) {
  const e = doc.data();
  const ref = (e.reference ?? "") + (e.referenceId ?? "") + (e.description ?? "");
  if (ref.includes("CT2605111") || ref.includes("CT260511")) {
    console.log(`Entry: ${e.entryNumber ?? doc.id}  Date: ${e.entryDate}  Status: ${e.status}`);
    console.log(`  Description: ${e.description}`);
    console.log(`  Reference:   ${e.reference ?? ""}  referenceId: ${e.referenceId ?? ""}`);
    console.log(`  referenceType: ${e.referenceType ?? ""}`);
    console.log(`  Line items:`);
    for (const line of (e.lineItems ?? [])) {
      console.log(`    ${line.accountCode.padEnd(6)} ${line.accountName?.padEnd(35)}  DR ₦${line.debit}  CR ₦${line.credit}`);
    }
    console.log();
  }
}
