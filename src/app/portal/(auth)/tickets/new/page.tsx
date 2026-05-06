"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { submitPortalTicket } from "@/lib/client-portal-service";
import { PRIORITY_LABELS } from "@/types/tickets";
import type { TicketPriority } from "@/types/tickets";

const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "critical"];

export default function PortalNewTicketPage() {
  const { profile, clientRecord } = useClientAuth();
  const router = useRouter();

  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority]       = useState<TicketPriority>("medium");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const clientName    = clientRecord?.company || clientRecord?.fullName || profile?.email || "";
  const clientContact = clientRecord?.email || profile?.email || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !profile) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPortalTicket({
        clientName,
        clientContact,
        title:       title.trim(),
        description: description.trim(),
        priority,
        createdBy:   profile.uid,
      });
      router.push("/portal/tickets");
    } catch {
      setError("Failed to submit ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in max-w-xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-xs text-white/30 hover:text-white font-helvetica transition-colors">
          ← Back
        </button>
        <h1 className="font-orbitron text-xl font-bold text-white mt-1">Submit Support Request</h1>
        <p className="text-white/40 text-sm font-helvetica mt-1">
          Describe your issue and our team will respond promptly.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/50 font-helvetica uppercase tracking-wider mb-2">
              Issue Title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue…"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-helvetica focus:outline-none focus:border-accent/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 font-helvetica uppercase tracking-wider mb-2">
              Priority
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors ${
                    priority === p
                      ? p === "critical" ? "bg-red-500/20 text-red-400 border-red-500/40"
                      : p === "high"     ? "bg-accent/20 text-accent border-accent/40"
                      : p === "medium"   ? "bg-secondary/20 text-secondary border-secondary/40"
                      :                    "bg-white/10 text-white/60 border-white/20"
                      : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/50 font-helvetica uppercase tracking-wider mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Provide as much detail as possible: what happened, when it started, any error messages…"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-helvetica focus:outline-none focus:border-accent/50 transition-all resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold font-helvetica py-3.5 rounded-xl transition-all text-sm"
        >
          {submitting ? "Submitting…" : "Submit Support Request"}
        </button>
      </form>
    </div>
  );
}
