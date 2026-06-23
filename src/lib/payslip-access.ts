import { hasPermission } from "@/types/roles";

/** Whether `role` may view/download ANOTHER employee's individual payslip
 * data — not just their own. Canonical access list: Root Admin, System
 * Admin, HR (exactly manage:hr — CFO and CEO are deliberately excluded;
 * they get the aggregate payroll summary instead, not individual slips).
 *
 * Uses hasPermission()/resolveRole() so legacy role aliases (e.g.
 * "Chronix Root", "Root") resolve correctly. Replaces the raw
 * MANAGER_ROLES string Set previously duplicated across all three payslip
 * routes, which silently rejected those aliases despite isRootAdmin()
 * recognizing them everywhere else in the app. */
export function canManageOthersPayslips(role: string | undefined): boolean {
  return !!role && hasPermission(role, "manage:hr");
}
