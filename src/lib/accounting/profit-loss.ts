import { getJournalEntriesByDateRange } from "./journal-entries";
import type { ProfitLossReport } from "@/types/finance";

export async function generateProfitLoss(
  startDate: string,
  endDate: string,
  userId: string
): Promise<ProfitLossReport> {
  const entries = await getJournalEntriesByDateRange(startDate, endDate);

  const rev: ProfitLossReport["revenue"] = {
    itConsulting: 0, networkServices: 0, hardwareSales: 0,
    branding: 0, softwareDev: 0, other: 0, total: 0,
  };
  const cos: ProfitLossReport["costOfSales"] = {
    hardwareCost: 0, directCosts: 0, subcontractors: 0, total: 0,
  };
  const opex: ProfitLossReport["operatingExpenses"] = {
    salaries: 0, rent: 0, internet: 0, fuel: 0, marketing: 0,
    professional: 0, utilities: 0, subscriptions: 0, other: 0, total: 0,
  };

  for (const entry of entries) {
    for (const line of entry.lineItems) {
      const { accountCode: code } = line;
      // Revenue: credits increase revenue (credit - debit)
      const revenueAmt = line.credit - line.debit;
      // Expense: debits increase expenses (debit - credit)
      const expenseAmt = line.debit - line.credit;

      if      (code === "4010") rev.itConsulting   += revenueAmt;
      else if (code === "4020") rev.networkServices += revenueAmt;
      else if (code === "4030") rev.hardwareSales   += revenueAmt;
      else if (code === "4040") rev.branding        += revenueAmt;
      else if (code === "4050") rev.softwareDev     += revenueAmt;
      else if (code.startsWith("4")) rev.other      += revenueAmt;

      else if (code === "5010") cos.hardwareCost    += expenseAmt;
      else if (code === "5020") cos.directCosts     += expenseAmt;
      else if (code === "5030") cos.subcontractors  += expenseAmt;

      else if (code === "6010") opex.salaries       += expenseAmt;
      else if (code === "6020") opex.rent           += expenseAmt;
      else if (code === "6030") opex.internet       += expenseAmt;
      else if (code === "6040") opex.fuel           += expenseAmt;
      else if (code === "6060") opex.marketing      += expenseAmt;
      else if (code === "6070") opex.professional   += expenseAmt;
      else if (code === "6200") opex.utilities      += expenseAmt;
      else if (code === "6300") opex.subscriptions  += expenseAmt;
      else if (code.startsWith("6")) opex.other     += expenseAmt;
    }
  }

  rev.total  = rev.itConsulting + rev.networkServices + rev.hardwareSales +
               rev.branding + rev.softwareDev + rev.other;
  cos.total  = cos.hardwareCost + cos.directCosts + cos.subcontractors;
  opex.total = opex.salaries + opex.rent + opex.internet + opex.fuel +
               opex.marketing + opex.professional + opex.utilities +
               opex.subscriptions + opex.other;

  const grossProfit = rev.total - cos.total;
  const grossMargin = rev.total > 0 ? (grossProfit / rev.total) * 100 : 0;
  const netProfit   = grossProfit - opex.total;
  const netMargin   = rev.total > 0 ? (netProfit  / rev.total) * 100 : 0;

  return {
    id:          `pl_${startDate}_${endDate}`,
    reportDate:  endDate,
    period:      "monthly",
    startDate,
    endDate,
    revenue:          rev,
    costOfSales:      cos,
    grossProfit,
    grossMargin,
    operatingExpenses: opex,
    netProfit,
    netMargin,
    generatedAt: new Date().toISOString(),
    generatedBy: userId,
  };
}

export async function generateQuarterlyPL(year: number, quarter: number, userId: string): Promise<ProfitLossReport> {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth   = quarter * 3;
  const startDate  = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endDay     = new Date(year, endMonth, 0).getDate();
  const endDate    = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  const report     = await generateProfitLoss(startDate, endDate, userId);
  report.period    = "quarterly";
  return report;
}

export async function generateAnnualPL(year: number, userId: string): Promise<ProfitLossReport> {
  const report  = await generateProfitLoss(`${year}-01-01`, `${year}-12-31`, userId);
  report.period = "annual";
  return report;
}
