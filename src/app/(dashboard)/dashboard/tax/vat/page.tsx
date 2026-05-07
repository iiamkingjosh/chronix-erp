"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getVATRecords, createVATRecord } from "@/lib/tax-service";
import { currentPeriod, formatTaxDate } from "@/types/tax";
import type { VATRecord } from "@/types/tax";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

const VAT_RATE = 0.075;

interface VATSummary {
  collected: number;
  paid:      number;
  net:       number;
}

type PeriodOption = { label: string; value: string };

function buildPeriodOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) });
  }
  return opts;
}

export default function VATPage() {
  const { profile }                 = useAuth();
  const [period, setPeriod]         = useState(currentPeriod());
  const [summary, setSummary]       = useState<VATSummary>({ collected: 0, paid: 0, net: 0 });
  const [records, setRecords]       = useState<VATRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm]         = useState({ type: "collected" as VATRecord["type"], amount: "", sourceType: "invoice" as VATRecord["sourceType"], sourceRef: "", partyName: "", date: new Date().toISOString().split("T")[0] });
  const [logging, setLogging]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const canManage = profile ? hasPermission(profile.role, "manage:tax") : false;
  const periodOptions = buildPeriodOptions();

  async function load(p: string) {
    setLoading(true);
    setError(null);
    try {
      const [invSnap, poSnap, storedRecs] = await Promise.all([
        getDocs(collection(db, "invoices")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "purchase_orders")).catch(() => ({ docs: [] })),
        getVATRecords(p).catch(() => []),
      ]);

      const invoices = invSnap.docs.map((d) => d.data()) as Record<string, unknown>[];
      const pos      = poSnap.docs.map((d) => d.data()) as Record<string, unknown>[];

      const collected = invoices
        .filter((i) => i.status === "paid" && String(i.invoiceDate ?? "").startsWith(p))
        .reduce((s, i) => s + (i.vatAmount != null ? Number(i.vatAmount) : Number(i.total as number) * VAT_RATE || 0), 0);

      const paid = pos
        .filter((po) => (po.status === "approved" || po.status === "delivered") && String(po.approvedAt ?? po.createdAt ?? "").startsWith(p))
        .reduce((s, po) => s + (Number(po.total) || 0) * VAT_RATE, 0);

      setSummary({ collected, paid, net: collected - paid });
      setRecords(storedRecs);
    } catch {
      setError("Failed to load VAT data. Check your connection and try again.");
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(period); }, [period]);

  async function handleLogVAT() {
    if (!profile || !logForm.partyName || !logForm.amount) return;
    setLogging(true);
    try {
      const rec = await createVATRecord({
        type: logForm.type,
        amount: Number(logForm.amount),
        sourceType: logForm.sourceType,
        sourceId: "",
        sourceRef: logForm.sourceRef,
        partyName: logForm.partyName,
        date: logForm.date,
        period,
        createdAt: new Date().toISOString(),
      });
      setRecords((prev) => [rec, ...prev]);
      setShowLogForm(false);
      setLogForm({ type: "collected", amount: "", sourceType: "invoice", sourceRef: "", partyName: "", date: new Date().toISOString().split("T")[0] });

      /* Push + email notification */
      auth.currentUser?.getIdToken().then((idToken) => {
        fetch("/api/notifications/send", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body:    JSON.stringify({
            type:        "renewal_due",
            title:       `VAT Entry Logged — ${rec.type === "collected" ? "Collected" : "Paid"}`,
            message:     `Manual VAT entry of ${formatNaira(rec.amount)} (${rec.type}) recorded for ${rec.partyName} in period ${period}.`,
            link:        "/dashboard/tax/vat",
            targetRoles: ["CEO", "CFO", "System Admin"],
            sendEmail:   true,
            sendPush:    true,
          }),
        }).catch(() => {});
      }).catch(() => {});
    } finally { setLogging(false); }
  }

  return (
    <div className="animate-fade-in space-y-5">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/20 rounded-xl">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-red-300/80 text-sm font-helvetica flex-1">{error}</p>
          <button onClick={() => load(period)} className="text-xs text-red-400 hover:text-red-300 font-helvetica border border-red-500/20 hover:border-red-400/40 px-3 py-1 rounded-lg transition-colors shrink-0">
            Retry
          </button>
        </div>
      )}
      {/* Period selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="field-label">Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input-field w-52">
            {periodOptions.map((o) => <option key={o.value} value={o.value} className="bg-primary-dark">{o.label}</option>)}
          </select>
        </div>
        {canManage && <button onClick={() => setShowLogForm(true)} className="btn-primary text-xs px-4 py-2.5 mt-5">+ Log VAT Entry</button>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "VAT Collected",  value: formatNaira(summary.collected), accent: "text-secondary",  sub: "from client invoices" },
          { label: "VAT on Expenses", value: formatNaira(summary.paid),    accent: "text-white/70",  sub: "on vendor purchases (est.)" },
          { label: "Net VAT Payable", value: formatNaira(summary.net),     accent: summary.net > 0 ? "text-amber-400" : "text-emerald-400", sub: summary.net > 0 ? "payable to FIRS" : "no liability" },
        ].map((c) => (
          <div key={c.label} className="surface-card p-5">
            <p className="text-white/40 text-xs font-helvetica uppercase tracking-wider mb-2">{c.label}</p>
            <p className={cn("font-orbitron text-2xl font-bold tabular-nums", c.accent)}>{c.value}</p>
            <p className="text-xs text-white/25 font-helvetica mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* VAT payable notice */}
      {summary.net > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <span className="text-amber-400">⚠</span>
          <p className="text-amber-300/80 text-sm font-helvetica">
            Net VAT of <strong className="text-amber-300">{formatNaira(summary.net)}</strong> is payable to FIRS by the 21st of next month.
          </p>
        </div>
      )}

      {/* Manual log form */}
      {showLogForm && canManage && (
        <div className="surface-card p-6 border border-accent/20 animate-fade-in">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Log VAT Transaction</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="field-label">Type</label>
              <select value={logForm.type} onChange={(e) => setLogForm((p) => ({ ...p, type: e.target.value as VATRecord["type"] }))} className="input-field">
                <option value="collected" className="bg-primary-dark">Collected (from client)</option>
                <option value="paid" className="bg-primary-dark">Paid (on expense)</option>
              </select>
            </div>
            <div>
              <label className="field-label">VAT Amount (₦)</label>
              <input type="number" min="0" value={logForm.amount} onChange={(e) => setLogForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="input-field" />
            </div>
            <div>
              <label className="field-label">Source Reference</label>
              <input value={logForm.sourceRef} onChange={(e) => setLogForm((p) => ({ ...p, sourceRef: e.target.value }))} placeholder="Invoice or PO number" className="input-field" />
            </div>
            <div>
              <label className="field-label">Party Name</label>
              <input value={logForm.partyName} onChange={(e) => setLogForm((p) => ({ ...p, partyName: e.target.value }))} placeholder="Client or vendor name" className="input-field" />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input type="date" value={logForm.date} onChange={(e) => setLogForm((p) => ({ ...p, date: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleLogVAT} disabled={logging} className="btn-primary text-xs px-5 py-2.5">{logging ? "Saving…" : "Log Entry"}</button>
            <button onClick={() => setShowLogForm(false)} className="text-xs text-white/40 hover:text-white font-helvetica transition-colors px-3">Cancel</button>
          </div>
        </div>
      )}

      {/* VAT records table */}
      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Manual VAT Entries — {period}</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : records.length === 0 ? (
          <div className="px-6 py-12 text-center"><p className="text-white/20 text-sm font-helvetica">No manual VAT entries for this period. VAT is computed automatically from invoices and purchase orders.</p></div>
        ) : (
          <div className="divide-y divide-white/5">
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica shrink-0", r.type === "collected" ? "bg-secondary/15 text-secondary border-secondary/30" : "bg-white/8 text-white/40 border-white/15")}>
                  {r.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-helvetica">{r.partyName}</p>
                  {r.sourceRef && <p className="text-xs text-white/30 font-helvetica">{r.sourceRef}</p>}
                </div>
                <p className="text-sm font-semibold text-white font-helvetica">{formatNaira(r.amount)}</p>
                <p className="text-xs text-white/30 font-helvetica shrink-0">{formatTaxDate(r.date)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
