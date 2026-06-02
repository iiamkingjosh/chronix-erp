import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getJournalEntriesByDateRange, createJournalEntry } from "./journal-entries";
import type { JournalEntry } from "@/types/finance";
import { round } from "@/lib/utils";

export interface YearEndSummary {
  year:          number;
  totalRevenue:  number;
  totalExpenses: number;
  netProfit:     number;
  alreadyClosed: boolean;
  closingRef?:   string;
}

async function isAlreadyClosed(year: number): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, "journal_entries"), where("reference", "==", `YEC-${year}`))
  );
  return !snap.empty;
}

function accumulate(entries: JournalEntry[]): {
  revenue:  Record<string, { name: string; net: number }>;
  expenses: Record<string, { name: string; net: number }>;
} {
  const revenue:  Record<string, { name: string; net: number }> = {};
  const expenses: Record<string, { name: string; net: number }> = {};

  for (const entry of entries) {
    for (const line of entry.lineItems) {
      const code = line.accountCode;
      if (code.startsWith("4")) {
        if (!revenue[code]) revenue[code] = { name: line.accountName, net: 0 };
        revenue[code].net = round(revenue[code].net + line.credit - line.debit);
      } else if (code.startsWith("5") || code.startsWith("6")) {
        if (!expenses[code]) expenses[code] = { name: line.accountName, net: 0 };
        expenses[code].net = round(expenses[code].net + line.debit - line.credit);
      }
    }
  }

  return { revenue, expenses };
}

export async function getYearEndSummary(year: number): Promise<YearEndSummary> {
  const [entries, closed] = await Promise.all([
    getJournalEntriesByDateRange(`${year}-01-01`, `${year}-12-31`),
    isAlreadyClosed(year),
  ]);

  const { revenue, expenses } = accumulate(entries);
  const totalRevenue  = round(Object.values(revenue).reduce((s, b) => s + b.net,  0));
  const totalExpenses = round(Object.values(expenses).reduce((s, b) => s + b.net, 0));
  const netProfit     = round(totalRevenue - totalExpenses);

  return {
    year,
    totalRevenue,
    totalExpenses,
    netProfit,
    alreadyClosed: closed,
    closingRef:    closed ? `YEC-${year}` : undefined,
  };
}

export async function runYearEndClose(year: number, userId: string): Promise<JournalEntry> {
  if (await isAlreadyClosed(year)) {
    throw new Error(`Year-end close for ${year} already posted`);
  }

  const entries = await getJournalEntriesByDateRange(`${year}-01-01`, `${year}-12-31`);
  const { revenue, expenses } = accumulate(entries);

  const totalRevenue  = round(Object.values(revenue).reduce((s, b) => s + b.net,  0));
  const totalExpenses = round(Object.values(expenses).reduce((s, b) => s + b.net, 0));
  const netProfit     = round(totalRevenue - totalExpenses);

  const lineItems: Array<{ accountCode: string; accountName: string; debit: number; credit: number; description: string }> = [];

  for (const [code, bal] of Object.entries(revenue)) {
    if (bal.net > 0) {
      lineItems.push({ accountCode: code, accountName: bal.name, debit: bal.net, credit: 0, description: `Close FY${year} revenue — ${bal.name}` });
    }
  }

  for (const [code, bal] of Object.entries(expenses)) {
    if (bal.net > 0) {
      lineItems.push({ accountCode: code, accountName: bal.name, debit: 0, credit: bal.net, description: `Close FY${year} expenses — ${bal.name}` });
    }
  }

  if (netProfit >= 0) {
    lineItems.push({ accountCode: "3100", accountName: "Retained Earnings", debit: 0, credit: netProfit, description: `Net profit FY${year} transferred to Retained Earnings` });
  } else {
    lineItems.push({ accountCode: "3100", accountName: "Retained Earnings", debit: Math.abs(netProfit), credit: 0, description: `Net loss FY${year} charged to Retained Earnings` });
  }

  const now = new Date().toISOString();

  return createJournalEntry({
    entryDate:     `${year}-12-31`,
    description:   `Year-End Close ${year} — transfer P&L to Retained Earnings`,
    reference:     `YEC-${year}`,
    referenceType: "manual",
    lineItems,
    status:        "posted",
    createdBy:     userId,
    postedBy:      userId,
    postedAt:      now,
  });
}
