"use client";

import { useEffect, useState } from "react";
import { getJournalEntriesByDateRange } from "@/lib/accounting/journal-entries";
import { formatNaira } from "@/types/finance";
import type { JournalEntry } from "@/types/finance";
import { cn } from "@/lib/utils";

function fmtD(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function JournalEntriesPage() {
  const now = new Date();
  const [start, setStart]     = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
  const [end,   setEnd]       = useState(now.toISOString().split("T")[0]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setEntries(await getJournalEntriesByDateRange(start, end)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="animate-fade-in">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-xs text-white/40 font-helvetica block mb-1">From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input-field w-40 text-sm" />
        </div>
        <div>
          <label className="text-xs text-white/40 font-helvetica block mb-1">To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input-field w-40 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
          {loading ? "Loading…" : "Search"}
        </button>
        <div className="ml-auto text-xs text-white/30 font-helvetica self-center">
          {entries.length} entries
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="surface-card px-6 py-16 text-center">
          <p className="text-white/20 text-sm font-helvetica">No journal entries found for this period.</p>
          <p className="text-white/10 text-xs font-helvetica mt-2">Journal entries are auto-created when invoices and payments are recorded.</p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Entry #</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Description</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Type</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Debit</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-accent">{entry.entryNumber}</td>
                    <td className="px-5 py-3 text-xs text-white/50 font-helvetica">{fmtD(entry.entryDate)}</td>
                    <td className="px-5 py-3 text-sm text-white font-helvetica max-w-xs truncate">{entry.description}</td>
                    <td className="px-5 py-3">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize",
                        entry.referenceType === "invoice" && "bg-blue-500/15 text-blue-400 border-blue-500/30",
                        entry.referenceType === "payment" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                        entry.referenceType === "expense" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                        entry.referenceType === "manual"  && "bg-white/10 text-white/40 border-white/15",
                      )}>
                        {entry.referenceType ?? "manual"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-right font-helvetica text-white">{formatNaira(entry.totalDebit)}</td>
                    <td className="px-5 py-3 text-sm text-right font-helvetica text-white">{formatNaira(entry.totalCredit)}</td>
                  </tr>
                  {expanded === entry.id && (
                    <tr key={`${entry.id}-lines`} className="bg-white/[0.02]">
                      <td colSpan={6} className="px-8 py-4">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="pb-2 text-left text-white/30 font-helvetica font-semibold">Account</th>
                              <th className="pb-2 text-left text-white/30 font-helvetica font-semibold">Description</th>
                              <th className="pb-2 text-right text-white/30 font-helvetica font-semibold">Debit</th>
                              <th className="pb-2 text-right text-white/30 font-helvetica font-semibold">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lineItems.map((line, i) => (
                              <tr key={i} className="border-b border-white/5">
                                <td className="py-1.5 font-mono text-accent">{line.accountCode} <span className="text-white/50 font-helvetica not-italic">{line.accountName}</span></td>
                                <td className="py-1.5 text-white/40 font-helvetica">{line.description ?? "—"}</td>
                                <td className="py-1.5 text-right font-helvetica text-white">{line.debit  > 0 ? formatNaira(line.debit)  : "—"}</td>
                                <td className="py-1.5 text-right font-helvetica text-white">{line.credit > 0 ? formatNaira(line.credit) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
