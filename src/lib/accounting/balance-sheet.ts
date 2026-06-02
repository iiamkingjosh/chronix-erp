import { getJournalEntriesByDateRange } from "./journal-entries";

export async function generateBalanceSheet(asOfDate: string, userId: string) {
  const entries = await getJournalEntriesByDateRange("2020-01-01", asOfDate);

  // Accumulate net debit (debit − credit) per account code across all time
  const bal: Record<string, number> = {};
  for (const entry of entries) {
    for (const line of entry.lineItems) {
      bal[line.accountCode] = (bal[line.accountCode] ?? 0) + (line.debit - line.credit);
    }
  }

  const g = (code: string) => bal[code] ?? 0;

  // ── Current-year profit: dynamically derived from journal entries ──────────
  // Revenue accounts (4xxx): credit-normal — net balance is negative in bal[]
  // Expense accounts (5xxx, 6xxx): debit-normal — net balance is positive in bal[]
  const currentYear = asOfDate.slice(0, 4);
  let ytdRevenue = 0;
  let ytdExpenses = 0;
  for (const entry of entries) {
    if (!entry.entryDate.startsWith(currentYear)) continue;
    for (const line of entry.lineItems) {
      if (line.accountCode.startsWith("4")) ytdRevenue  += line.credit - line.debit;
      if (line.accountCode.startsWith("5") || line.accountCode.startsWith("6"))
        ytdExpenses += line.debit - line.credit;
    }
  }
  const currentYearProfit = ytdRevenue - ytdExpenses;

  // ── Assets ─────────────────────────────────────────────────────────────────
  // Asset accounts (1xxx) are debit-normal: positive bal[] = positive balance.
  // VAT Recoverable is a genuine current asset — stored under 1110 (not 2110).
  const assets = {
    currentAssets: {
      cash:               g("1010"),
      pettyCash:          g("1020"),
      accountsReceivable: g("1100"),
      vatRecoverable:     g("1110"),
      inventory:          g("1200"),
      prepaidExpenses:    g("1300"),
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
    assets.currentAssets.cash         + assets.currentAssets.pettyCash +
    assets.currentAssets.accountsReceivable + assets.currentAssets.vatRecoverable +
    assets.currentAssets.inventory    + assets.currentAssets.prepaidExpenses;
  assets.fixedAssets.total =
    assets.fixedAssets.officeEquipment + assets.fixedAssets.computerEquipment;
  assets.total = assets.currentAssets.total + assets.fixedAssets.total;

  // ── Liabilities ────────────────────────────────────────────────────────────
  // Liability accounts (2xxx) are credit-normal: bal[] is negative, so negate.
  const liabilities = {
    currentLiabilities: {
      accountsPayable: -g("2010"),
      vatPayable:      -g("2100"),
      vatRecoverable:  -g("1110"),
      whtPayable:      -g("2200"),
      payePayable:     -g("2300"),
      total: 0,
    },
    total: 0,
  };
  liabilities.currentLiabilities.total =
    Math.max(0, liabilities.currentLiabilities.accountsPayable) +
    Math.max(0, liabilities.currentLiabilities.vatPayable)      +
    Math.max(0, liabilities.currentLiabilities.vatRecoverable)  +
    Math.max(0, liabilities.currentLiabilities.whtPayable)      +
    Math.max(0, liabilities.currentLiabilities.payePayable);
  liabilities.total = liabilities.currentLiabilities.total;

  // ── Equity ─────────────────────────────────────────────────────────────────
  // Equity accounts (3xxx) are credit-normal: bal[] is negative, so negate.
  // currentYearProfit is derived above, not read from a static account.
  const equity = {
    shareCapital:      -(g("3010") + g("3020") + g("3030")),
    retainedEarnings:  -g("3100"),
    currentYearProfit,
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
