import { getJournalEntriesByDateRange } from "./journal-entries";

export async function generateBalanceSheet(asOfDate: string, userId: string) {
  // Read all posted entries from the beginning of time to the given date
  const entries = await getJournalEntriesByDateRange("2026-01-01", asOfDate);

  const bal: Record<string, number> = {};
  for (const entry of entries) {
    for (const line of entry.lineItems) {
      bal[line.accountCode] = (bal[line.accountCode] ?? 0) + (line.debit - line.credit);
    }
  }

  const g = (code: string) => bal[code] ?? 0;

  const assets = {
    currentAssets: {
      cash:               g("1010"),
      pettyCash:          g("1020"),
      accountsReceivable: g("1100"),
      inventory:          g("1200"),
      prepaidExpenses:    g("1300"),
      vatRecoverable:     g("2110"),
      total: 0,
    },
    fixedAssets: {
      officeEquipment:   g("1400"),
      computerEquipment: g("1500"),
      total: 0,
    },
    total: 0,
  };
  assets.currentAssets.total =
    assets.currentAssets.cash + assets.currentAssets.pettyCash +
    assets.currentAssets.accountsReceivable + assets.currentAssets.inventory +
    assets.currentAssets.prepaidExpenses + assets.currentAssets.vatRecoverable;
  assets.fixedAssets.total =
    assets.fixedAssets.officeEquipment + assets.fixedAssets.computerEquipment;
  assets.total = assets.currentAssets.total + assets.fixedAssets.total;

  const liabilities = {
    currentLiabilities: {
      accountsPayable: Math.abs(g("2010")),
      vatPayable:      Math.abs(g("2100")),
      whtPayable:      Math.abs(g("2200")),
      payePayable:     Math.abs(g("2300")),
      total: 0,
    },
    total: 0,
  };
  liabilities.currentLiabilities.total =
    liabilities.currentLiabilities.accountsPayable +
    liabilities.currentLiabilities.vatPayable +
    liabilities.currentLiabilities.whtPayable +
    liabilities.currentLiabilities.payePayable;
  liabilities.total = liabilities.currentLiabilities.total;

  const equity = {
    shareCapital:       Math.abs(g("3010")) + Math.abs(g("3020")) + Math.abs(g("3030")),
    retainedEarnings:   Math.abs(g("3100")),
    currentYearProfit:  Math.abs(g("3200")),
    total: 0,
  };
  equity.total = equity.shareCapital + equity.retainedEarnings + equity.currentYearProfit;

  const totalLiabilitiesAndEquity = liabilities.total + equity.total;
  const balanced = Math.abs(assets.total - totalLiabilitiesAndEquity) < 1;

  return {
    id: `bs_${asOfDate}`,
    asOfDate,
    assets,
    liabilities,
    equity,
    totalLiabilitiesAndEquity,
    balanced,
    generatedAt: new Date().toISOString(),
    generatedBy: userId,
  };
}
