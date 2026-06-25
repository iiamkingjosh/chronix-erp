import { collection, doc, getDoc, getDocs, setDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { ExpenseBudget } from "@/types/budget";
import { budgetDocId } from "@/types/budget";
import type { ExpenseCategory } from "@/types/expense";
import { EXPENSE_CATEGORY_LABELS } from "@/types/expense";
import { canSetBudget } from "@/types/roles";
import { logAuditEvent } from "@/lib/audit-service";
import { validateAmount } from "@/lib/utils";

const COL = "expense_budgets";
const USERS = "users";

/** Upserts the one annual budget for a category/year.
 *
 * Gated to canSetBudget() here AND at firestore.rules' expense_budgets
 * write rule — the function-level check is not just a UI nicety, it's
 * enforced independently of the rule, same precedent as
 * updateEmployeeSalary() (hr-service.ts). The actor's role is re-fetched
 * from users/{actorUid} itself rather than trusted from a caller-supplied
 * parameter — a forged role string passed in can't be used to bypass
 * this check, since it's never consulted; only the real, stored role is.
 *
 * Logs the old -> new amount on every change, not just creation, so a
 * budget revision has a real audit trail. */
export async function setBudget(
  category: ExpenseCategory,
  year: number,
  amount: number,
  actorUid: string
): Promise<ExpenseBudget> {
  validateAmount(amount);

  const actorSnap = await getDoc(doc(db, USERS, actorUid));
  const actorData = actorSnap.data() as Record<string, unknown> | undefined;
  const actorRole = (actorData?.role ?? "") as string;

  // Function-level gate, independent of the firestore.rules check — don't
  // rely on the rule alone to enforce this.
  if (!canSetBudget(actorRole)) {
    throw new Error("You do not have permission to set a budget.");
  }

  const actorName = (actorData?.displayName ?? actorData?.email ?? actorUid) as string;

  const id  = budgetDocId(year, category);
  const ref = doc(db, COL, id);
  const existing = await getDoc(ref);
  const oldAmount = existing.exists() ? (existing.data().annualBudgetAmount as number) : null;

  const now = new Date().toISOString();
  const budget: ExpenseBudget = existing.exists()
    ? { ...(existing.data() as ExpenseBudget), annualBudgetAmount: amount, lastUpdatedBy: actorName, lastUpdatedAt: now }
    : { id, category, year, annualBudgetAmount: amount, setBy: actorName, setAt: now, lastUpdatedBy: actorName, lastUpdatedAt: now };

  await setDoc(ref, budget);

  logAuditEvent({
    actorUid,
    actorName,
    actorRole,
    action:     existing.exists() ? "update" : "create",
    module:     "expenses",
    entityId:   id,
    entityRef:  `${EXPENSE_CATEGORY_LABELS[category]} ${year}`,
    details:    oldAmount != null
      ? `Budget for ${EXPENSE_CATEGORY_LABELS[category]} ${year} changed from ₦${oldAmount.toLocaleString()} to ₦${amount.toLocaleString()}`
      : `Budget set for ${EXPENSE_CATEGORY_LABELS[category]} ${year}: ₦${amount.toLocaleString()}`,
    timestamp:  now,
  }).catch(() => {});

  return budget;
}

/** Read access is broader than setBudget()'s write gate — matches
 * whoever can already view finance reports today (firestore.rules:
 * hasViewFinance()), not the narrower canSetBudget() set. */
export async function getBudgetsForYear(year: number): Promise<ExpenseBudget[]> {
  const snap = await getDocs(query(collection(db, COL), where("year", "==", year)));
  return snap.docs.map((d) => d.data() as ExpenseBudget);
}
