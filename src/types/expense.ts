export type ExpenseCategory =
  | "travel" | "meals" | "equipment" | "software" | "marketing"
  | "utilities" | "rent" | "salaries" | "contractor" | "other";

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
}

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  department?: string;
  description: string;
  receiptUrl?: string;
  status: ExpenseStatus;
  submittedBy: string;
  submittedByUid: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
  linkedProject?: string;
  linkedClient?: string;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel:     "Travel",
  meals:      "Meals & Entertainment",
  equipment:  "Equipment",
  software:   "Software & Subscriptions",
  marketing:  "Marketing",
  utilities:  "Utilities",
  rent:       "Rent & Office",
  salaries:   "Salaries",
  contractor: "Contractor",
  other:      "Other",
};

export const EXPENSE_STATUS_STYLES: Record<ExpenseStatus, string> = {
  pending:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  paid:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export function generateExpenseId(): string {
  return `EXP-${Date.now().toString(36).toUpperCase()}`;
}
