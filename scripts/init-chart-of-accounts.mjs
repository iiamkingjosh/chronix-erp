import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";
import { createRequire }       from "module";
import { dirname, join }       from "path";
import { fileURLToPath }       from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const svc       = require(join(__dirname, "../config/chronix-erp-firebase-adminsdk-fbsvc-3ba562100b.json"));

initializeApp({ credential: cert(svc) });
const db = getFirestore();

/* ── 41 accounts for Chronix Technology Limited ─────────────────────────── */
const ACCOUNTS = [
  // ASSETS
  { accountCode: "1010", accountName: "Cash in Bank — Fidelity (5601601109)", accountType: "ASSET",     category: "Current Assets", isActive: true },
  { accountCode: "1020", accountName: "Petty Cash",                            accountType: "ASSET",     category: "Current Assets", isActive: true },
  { accountCode: "1100", accountName: "Accounts Receivable",                   accountType: "ASSET",     category: "Current Assets",               isActive: true },
  { accountCode: "1110", accountName: "VAT Recoverable (Input)",               accountType: "ASSET",     category: "Current Assets", subCategory: "Tax", isActive: true },
  { accountCode: "1200", accountName: "Inventory — Hardware for Resale",       accountType: "ASSET",     category: "Current Assets",               isActive: true },
  { accountCode: "1300", accountName: "Prepaid Expenses",                      accountType: "ASSET",     category: "Current Assets", isActive: true },
  { accountCode: "1400", accountName: "Office Equipment",                      accountType: "ASSET",     category: "Fixed Assets",   isActive: true },
  { accountCode: "1500", accountName: "Computer Equipment",                    accountType: "ASSET",     category: "Fixed Assets",   isActive: true },
  // LIABILITIES
  { accountCode: "2010", accountName: "Accounts Payable",    accountType: "LIABILITY", category: "Current Liabilities",                     isActive: true },
  { accountCode: "2100", accountName: "VAT Payable (7.5%)", accountType: "LIABILITY", category: "Current Liabilities", subCategory: "Tax", isActive: true },
  { accountCode: "2200", accountName: "WHT Payable",        accountType: "LIABILITY", category: "Current Liabilities", subCategory: "Tax", isActive: true },
  { accountCode: "2300", accountName: "PAYE Payable",               accountType: "LIABILITY", category: "Current Liabilities", subCategory: "Tax", isActive: true },
  { accountCode: "2400", accountName: "Payroll Deductions Payable", accountType: "LIABILITY", category: "Current Liabilities",                          isActive: true },
  // EQUITY
  { accountCode: "3010", accountName: "Share Capital — Moses Joshua (90%)",    accountType: "EQUITY",    category: "Equity", isActive: true },
  { accountCode: "3020", accountName: "Share Capital — Obadoni Mabel (5%)",    accountType: "EQUITY",    category: "Equity", isActive: true },
  { accountCode: "3030", accountName: "Share Capital — Olanrewaju Seyi (5%)",  accountType: "EQUITY",    category: "Equity", isActive: true },
  { accountCode: "3100", accountName: "Retained Earnings",                     accountType: "EQUITY",    category: "Equity", isActive: true },
  { accountCode: "3200", accountName: "Current Year Profit / Loss",            accountType: "EQUITY",    category: "Equity", isActive: true },
  // REVENUE
  { accountCode: "4010", accountName: "IT Consulting Services Revenue",        accountType: "REVENUE",   category: "Revenue", isActive: true },
  { accountCode: "4020", accountName: "Network Infrastructure Revenue",        accountType: "REVENUE",   category: "Revenue", isActive: true },
  { accountCode: "4030", accountName: "Hardware Sales Revenue",                accountType: "REVENUE",   category: "Revenue", isActive: true },
  { accountCode: "4040", accountName: "Branding & Design Revenue",             accountType: "REVENUE",   category: "Revenue", isActive: true },
  { accountCode: "4050", accountName: "Software Development Revenue",          accountType: "REVENUE",   category: "Revenue", isActive: true },
  { accountCode: "4099", accountName: "Other Revenue",                         accountType: "REVENUE",   category: "Revenue", isActive: true },
  // COST OF SALES
  { accountCode: "5010", accountName: "Cost of Hardware Sold",                 accountType: "EXPENSE",   category: "Cost of Sales", isActive: true },
  { accountCode: "5020", accountName: "Direct Project Costs",                  accountType: "EXPENSE",   category: "Cost of Sales", isActive: true },
  { accountCode: "5030", accountName: "Subcontractor Costs",                   accountType: "EXPENSE",   category: "Cost of Sales", isActive: true },
  // OPERATING EXPENSES
  { accountCode: "6010", accountName: "Salaries & Wages",                      accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6020", accountName: "Rent",                                  accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6030", accountName: "Internet & Telecommunications",         accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6040", accountName: "Fuel & Transportation",                 accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6050", accountName: "Office Supplies",                       accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6060", accountName: "Marketing & Advertising",               accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6070", accountName: "Professional Fees (Legal, Accounting)", accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6080", accountName: "Bank Charges",                          accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6100", accountName: "Insurance",                             accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6200", accountName: "Utilities (Electricity, Water)",        accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6300", accountName: "Subscriptions (Software, SaaS)",        accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6400", accountName: "Training & Development",                accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6500", accountName: "Travel & Accommodation",                accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6600", accountName: "Entertainment & Client Relations",      accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
  { accountCode: "6700", accountName: "Repairs & Maintenance",                 accountType: "EXPENSE",   category: "Operating Expenses", isActive: true },
];

async function main() {
  console.log(`Initializing ${ACCOUNTS.length} accounts...\n`);
  const now     = new Date().toISOString();
  const userId  = "system-init";
  const batch   = db.batch();

  for (const account of ACCOUNTS) {
    batch.set(db.collection("chart_of_accounts").doc(account.accountCode), {
      ...account,
      id:        account.accountCode,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
    });
    console.log(`  ${account.accountCode}  ${account.accountName}`);
  }

  await batch.commit();
  console.log(`\nDone — ${ACCOUNTS.length} accounts written to Firestore.`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Init failed:", err);
  process.exit(1);
});
