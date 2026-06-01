"use client";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function MyPerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredPermission="view:own">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
        <h1 className="font-orbitron text-2xl font-bold text-white mb-6">My Performance</h1>
        {children}
      </div>
    </ProtectedRoute>
  );
}
