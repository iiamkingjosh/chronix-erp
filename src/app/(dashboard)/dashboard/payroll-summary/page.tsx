"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { hasPermission } from "@/types/roles";
import { MONTHS } from "@/types/hr";
import { formatNaira } from "@/types/finance";

interface PayrollSummary {
  runId:       string;
  month:       number;
  year:        number;
  status:      string;
  totalAmount: number;
  headcount:   number;
}

export default function PayrollSummaryPage() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const canView = profile ? hasPermission(profile.role, "view:payroll-summary") : false;

  useEffect(() => {
    if (!profile || !canView) { void Promise.resolve().then(() => setLoading(false)); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const res = await fetch("/api/payroll/summary", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) { if (!cancelled) setSummary(null); return; }
        if (!res.ok) throw new Error(await res.text());
        if (!cancelled) setSummary(await res.json());
      } catch {
        if (!cancelled) setError("Failed to load payroll summary.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, canView]);

  if (!canView) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">You do not have permission to view this page.</p></div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (error) {
    return <p className="text-red-400 text-sm font-helvetica py-8 text-center">{error}</p>;
  }

  if (!summary) {
    return <p className="text-white/20 text-sm font-helvetica py-16 text-center">No payroll run found yet.</p>;
  }

  const period = `${MONTHS[summary.month - 1]} ${summary.year}`;

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-6">
        <h1 className="font-orbitron text-2xl font-bold text-white">Payroll Summary</h1>
        <p className="text-white/40 text-sm font-helvetica mt-1">
          Aggregate figures only — no individual employee names, salaries, or department breakdown.
        </p>
      </div>

      <div className="surface-card p-6 mb-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">{period}</h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize bg-white/8 text-white/40 border-white/15">
            {summary.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="font-orbitron text-2xl font-bold text-accent">{formatNaira(summary.totalAmount)}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">Total Net Paid</p>
          </div>
          <div>
            <p className="font-orbitron text-2xl font-bold text-white">{summary.headcount}</p>
            <p className="text-white/30 text-xs font-helvetica mt-1">Employees Paid</p>
          </div>
        </div>
      </div>
    </div>
  );
}
