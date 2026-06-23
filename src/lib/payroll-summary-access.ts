import { hasPermission } from "@/types/roles";

/** Whether `role` may view the aggregate payroll summary (total amount +
 * headcount, no individual figures). Canonical access: Root Admin
 * (bypass), System Admin/CEO/Executive Assistant (all already have
 * view:all, which expands to any view:* permission — see hasPermission()),
 * and CFO explicitly via the view:payroll-summary permission added to its
 * ROLE_PERMISSIONS entry. Uses hasPermission()/resolveRole() so legacy
 * role aliases resolve correctly, matching the Stage 1 pattern. */
export function canViewPayrollSummary(role: string | undefined): boolean {
  return !!role && hasPermission(role, "view:payroll-summary");
}
