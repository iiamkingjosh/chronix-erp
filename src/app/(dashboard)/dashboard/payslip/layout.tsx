"use client";

import ProtectedRoute from "@/components/ProtectedRoute";

export default function PayslipLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredPermission="view:own">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">My Payslip</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Monthly payslip history</p>
        </div>
        {children}
      </div>
    </ProtectedRoute>
  );
}
