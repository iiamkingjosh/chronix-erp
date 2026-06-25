import type { ExpenseCategory } from "@/types/expense";

/** One annual budget per category — not split by expenseType. The
 * reporting layer splits staff_claim vs company_expense within a
 * category's actual spend, but the budget figure itself stays one
 * number per category, set once per year. */
export interface ExpenseBudget {
  id:                 string; // `${year}_${category}`
  category:           ExpenseCategory;
  year:               number;
  annualBudgetAmount: number;
  setBy:              string;
  setAt:              string;
  lastUpdatedBy:       string;
  lastUpdatedAt:       string;
}

export function budgetDocId(year: number, category: ExpenseCategory): string {
  return `${year}_${category}`;
}
