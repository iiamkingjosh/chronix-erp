"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { createExpense } from "@/lib/expense-service";
import { EXPENSE_CATEGORY_LABELS } from "@/types/expense";
import type { ExpenseCategory } from "@/types/expense";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export default function NewExpensePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", category: "other" as ExpenseCategory, amount: "",
    date: new Date().toISOString().split("T")[0], description: "",
    linkedProject: "", linkedClient: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.title || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      const exp = await createExpense({
        title:         form.title,
        category:      form.category,
        amount:        Number(form.amount),
        date:          form.date,
        description:   form.description,
        status:        "pending",
        submittedBy:   profile.displayName ?? profile.email,
        submittedByUid: profile.uid,
        submittedAt:   new Date().toISOString(),
        ...(form.linkedProject ? { linkedProject: form.linkedProject } : {}),
        ...(form.linkedClient  ? { linkedClient:  form.linkedClient  } : {}),
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "expenses", entityId: exp.id, entityRef: form.title, details: `Expense claim submitted: ${form.title} — ₦${form.amount}`, timestamp: new Date().toISOString() });
      router.push("/dashboard/finance/expenses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit expense");
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 hover:text-white transition-colors">
          <BackIcon />
        </button>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-white">New Expense Claim</h1>
          <p className="text-white/40 text-sm font-helvetica mt-0.5">Submit for approval</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
        <div>
          <label className="field-label">Expense Title</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Client meeting transport" className="input-field" required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="input-field">
              {CATEGORIES.map(([v, label]) => <option key={v} value={v} className="bg-primary-dark">{label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Amount (₦)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" className="input-field" required />
          </div>
        </div>
        <div>
          <label className="field-label">Date of Expense</label>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="field-label">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Provide context for this expense…" className="input-field resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Linked Project (optional)</label>
            <input value={form.linkedProject} onChange={(e) => set("linkedProject", e.target.value)} placeholder="Project name" className="input-field" />
          </div>
          <div>
            <label className="field-label">Linked Client (optional)</label>
            <input value={form.linkedClient} onChange={(e) => set("linkedClient", e.target.value)} placeholder="Client name" className="input-field" />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs font-helvetica">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className={cn("btn-primary flex-1", saving && "opacity-60")}>
            {saving ? "Submitting…" : "Submit for Approval"}
          </button>
          <button type="button" onClick={() => router.back()} className="text-xs text-white/40 hover:text-white font-helvetica px-4 border border-white/10 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function BackIcon() {
  return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>;
}
