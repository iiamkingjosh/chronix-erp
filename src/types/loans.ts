export type StaffLoanStatus = "pending" | "approved" | "active" | "completed" | "rejected";
export type StaffLoanRepaymentType = "payroll_deduction" | "early_repayment";

export interface StaffLoan {
  id:                string;
  employeeUid:       string;
  employeeName:      string;
  amount:            number;
  amountRepaid:      number;
  balance:           number;
  status:            StaffLoanStatus;
  repaymentMonths:   number;
  monthlyInstalment: number;
  carryover:         number;
  reason:            string;
  applicationDate:   string;
  approvedBy?:       string;
  approvedAt?:       string;
  disbursedAt?:      string;
  rejectionReason?:  string;
  completedAt?:      string;
  notes?:            string;
}

export interface StaffLoanRepayment {
  id:              string;
  loanId:          string;
  employeeUid:     string;
  payrollRunId?:   string;
  amountDeducted:  number;
  amountDue:       number;
  shortfall:       number;
  repaymentDate:   string;
  type:            StaffLoanRepaymentType;
  postedBy:        string;
}
