export type EmployeeStatus = "active" | "suspended" | "inactive";
export type PayrollEntryStatus = "pending" | "paid";
export type PayrollRunStatus   = "draft" | "completed";

export interface NextOfKin {
  name:         string;
  relationship: string;
  phone:        string;
}

export interface PerformanceNote {
  id:          string;
  period:      string;    // e.g. "2025-Q2"
  rating:      number;    // 1–5
  notes:       string;
  addedBy:     string;
  addedByName: string;
  createdAt:   string;
}

export interface Employee {
  id:             string;   // same as user UID
  uid:            string;
  employeeNumber?: string;  // e.g. CTL001 — assigned by hr-service.assignEmployeeNumber()
  fullName:       string;
  email:          string;
  phone:          string;
  role:           string;
  department:     string;
  salary:         number;   // monthly ₦
  bankName:       string;
  accountNumber:  string;
  accountName:    string;
  dateJoined:     string;
  status:         EmployeeStatus;
  nextOfKin:      NextOfKin;
  notes:          string;
  performanceNotes: PerformanceNote[];
  createdAt:      string;
  updatedAt:      string;
}

export interface PayrollEntry {
  uid:              string;
  name:             string;
  role:             string;
  department:       string;
  baseSalary:       number;
  deductions:       number;
  payeAmount?:      number;   // monthly PAYE computed at run time
  employeePension?: number;   // monthly 8% pension contribution
  nhf?:             number;   // monthly 2.5% NHF contribution
  deductionItems?:  { label: string; amount: number }[];
  netPay:           number;
  status:           PayrollEntryStatus;
  paidAt?:          string;
}

export interface PayrollRun {
  id:               string;
  month:            number;   // 1–12
  year:             number;
  status:           PayrollRunStatus;
  entries:          PayrollEntry[];
  totalGross:       number;
  totalDeductions:  number;
  totalNet:         number;
  generatedAt:      string;
  generatedBy:      string;
  generatedByName:  string;
  completedAt?:     string;
}

export interface PayslipSummary {
  month:              number;           // 1–12
  year:               number;
  baseSalary:         number;
  payeAmount:         number;           // PAYE income tax deducted
  deductions:         number;           // other deductions (catch-all)
  employeePension?:   number;           // monthly 8% employee pension
  nhf?:               number;           // monthly 2.5% NHF
  deductionItems?:    { label: string; amount: number }[];
  netPay:             number;
  status:             PayrollEntryStatus;
  paidAt?:            string;           // ISO 8601
  referenceNumber:    string;           // PSL-{YYYY}-{MM}-{employeeNumber|uid[-4:]}
  employeeName:       string;
  employeeRole:       string;
  employeeDepartment: string;
  employeeNumber?:    string;
}

export interface KPIScores {
  taskCompletionRate:       number; // 0–100, auto-populated (locked)
  ticketResolutionRate:     number; // 0–100, auto-populated (locked)
  attendancePunctuality:    number; // 0–100, manual
  qualityOfWork:            number; // 0–100, manual
  communicationTeamwork:    number; // 0–100, manual
  initiativeProblemSolving: number; // 0–100, manual
}

export type PerformanceEntitlement =
  | "Exceptional"        // 90–100
  | "Above Target"       // 75–89
  | "On Target"          // 60–74
  | "Below Target"       // 45–59
  | "Needs Improvement"; // < 45

export interface PerformanceReview {
  id:            string;
  employeeId:    string;           // uid of reviewed employee
  reviewPeriod:  string;           // "YYYY-MM" e.g. "2026-06"
  kpiScores:     KPIScores;
  overallScore:  number;           // Math.round(average of all 6)
  entitlement:   PerformanceEntitlement;
  comments:      string;
  createdBy:     string;
  createdByName: string;
  createdAt:     string;           // ISO 8601
}

export function calcOverallScore(scores: KPIScores): number {
  const vals = Object.values(scores) as number[];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function calcEntitlement(score: number): PerformanceEntitlement {
  if (score >= 90) return "Exceptional";
  if (score >= 75) return "Above Target";
  if (score >= 60) return "On Target";
  if (score >= 45) return "Below Target";
  return "Needs Improvement";
}

export const ENTITLEMENT_STYLES: Record<PerformanceEntitlement, string> = {
  "Exceptional":      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Above Target":     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "On Target":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Below Target":     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Needs Improvement":"bg-red-500/15 text-red-400 border-red-500/30",
};

export const KPI_LABELS: Record<keyof KPIScores, string> = {
  taskCompletionRate:       "Task Completion Rate",
  ticketResolutionRate:     "Ticket Resolution Rate",
  attendancePunctuality:    "Attendance & Punctuality",
  qualityOfWork:            "Quality of Work",
  communicationTeamwork:    "Communication & Teamwork",
  initiativeProblemSolving: "Initiative & Problem Solving",
};

export const KPI_LOCKED: Record<keyof KPIScores, boolean> = {
  taskCompletionRate:       true,
  ticketResolutionRate:     true,
  attendancePunctuality:    false,
  qualityOfWork:            false,
  communicationTeamwork:    false,
  initiativeProblemSolving: false,
};

/* ── Labels & Styles ── */
export const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export const EMPLOYEE_STATUS_STYLES: Record<EmployeeStatus, string> = {
  active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  suspended: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inactive:  "bg-white/8 text-white/30 border-white/10",
};

export const PAYROLL_ENTRY_STYLES: Record<PayrollEntryStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

/* ── Helpers ── */
export function formatHrDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatHrDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function payrollPeriod(month: number, year: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export const PERFORMANCE_PERIODS: string[] = (() => {
  const year = new Date().getFullYear();
  const prev = year - 1;
  return [
    `${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`,
    `${prev}-Q4`, `${prev}-Q3`,
  ];
})();
