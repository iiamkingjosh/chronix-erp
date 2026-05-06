"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getVendor, addVendorRating, getPOsByVendor } from "@/lib/procurement-service";
import {
  VENDOR_CATEGORY_LABELS, VENDOR_CATEGORY_STYLES, VENDOR_STATUS_STYLES,
  PO_STATUS_LABELS, PO_STATUS_STYLES,
  renderStars, formatProcDate, formatProcDateTime,
} from "@/types/procurement";
import type { Vendor, VendorRating, PurchaseOrder } from "@/types/procurement";
import { formatNaira } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const id = params?.id as string;

  const [vendor, setVendor]   = useState<Vendor | null>(null);
  const [orders, setOrders]   = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Rating form
  const [rating, setRating]       = useState(5);
  const [comment, setComment]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getVendor(id), getPOsByVendor(id)])
      .then(([v, pos]) => { setVendor(v); setOrders(pos); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAddRating() {
    if (!vendor || !profile) return;
    setSubmitting(true);
    try {
      const r: VendorRating = {
        id:           Date.now().toString(),
        rating,
        comment,
        ratedBy:      profile.uid,
        ratedByName:  profile.displayName ?? profile.email,
        createdAt:    new Date().toISOString(),
      };
      await addVendorRating(vendor.id, r, vendor.ratings);
      const all  = [...vendor.ratings, r];
      const avg  = Math.round((all.reduce((s, x) => s + x.rating, 0) / all.length) * 10) / 10;
      setVendor((prev) => prev ? { ...prev, ratings: all, avgRating: avg } : prev);
      setComment("");
      setRating(5);
    } finally { setSubmitting(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!vendor) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Vendor not found.</p></div>;
  }

  const totalSpend  = orders.reduce((s, o) => s + o.total, 0);
  const delivered   = orders.filter((o) => o.status === "delivered" || o.status === "paid");
  const pending     = orders.filter((o) => o.status === "pending" || o.status === "approved");
  const onTimeRate  = delivered.length > 0
    ? Math.round(delivered.filter((o) => new Date(o.deliveryDate) >= new Date(o.createdAt)).length / delivered.length * 100)
    : null;

  return (
    <div className="animate-fade-in max-w-6xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back to Vendors
      </button>

      {/* Header */}
      <div className="surface-card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-orbitron text-xs text-accent">{vendor.vendorId}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica capitalize", VENDOR_STATUS_STYLES[vendor.status])}>
                {vendor.status}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", VENDOR_CATEGORY_STYLES[vendor.category])}>
                {VENDOR_CATEGORY_LABELS[vendor.category]}
              </span>
            </div>
            <h2 className="font-orbitron text-xl font-bold text-white">{vendor.companyName}</h2>
            <p className="text-white/40 text-sm font-helvetica mt-0.5">{vendor.contactPerson}</p>
          </div>
          {vendor.avgRating > 0 && (
            <div className="text-right">
              <p className="text-accent text-2xl">{renderStars(vendor.avgRating)}</p>
              <p className="text-white/40 text-xs font-helvetica">{vendor.avgRating}/5 · {vendor.ratings.length} review{vendor.ratings.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Performance stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-xl font-bold text-white">{orders.length}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Total POs</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(totalSpend)}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Total Spend</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className="font-orbitron text-xl font-bold text-amber-400">{pending.length}</p>
              <p className="text-white/30 text-xs font-helvetica mt-1">Pending</p>
            </div>
            <div className="surface-card p-4 text-center">
              <p className={cn("font-orbitron text-xl font-bold", onTimeRate === null ? "text-white/30" : onTimeRate >= 80 ? "text-emerald-400" : "text-red-400")}>
                {onTimeRate !== null ? `${onTimeRate}%` : "—"}
              </p>
              <p className="text-white/30 text-xs font-helvetica mt-1">On-time Rate</p>
            </div>
          </div>

          {/* PO history */}
          <div className="surface-card">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">Purchase Order History</h3>
            </div>
            {orders.length === 0 ? (
              <p className="px-6 py-8 text-white/20 text-sm font-helvetica text-center">No purchase orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">PO #</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Date</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Delivery</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Total</th>
                      <th className="px-5 py-3 text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider font-helvetica">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.map((po) => (
                      <tr key={po.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 font-orbitron text-xs text-accent">{po.poNumber}</td>
                        <td className="px-5 py-3 text-xs text-white/40 font-helvetica">{formatProcDate(po.createdAt.split("T")[0])}</td>
                        <td className="px-5 py-3 text-xs text-white/40 font-helvetica">{formatProcDate(po.deliveryDate)}</td>
                        <td className="px-5 py-3 text-sm text-white font-semibold font-helvetica text-right">{formatNaira(po.total)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PO_STATUS_STYLES[po.status])}>
                            {PO_STATUS_LABELS[po.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ratings */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Performance Reviews</h3>

            {/* Add rating */}
            <div className="mb-5 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-xs font-semibold text-white/40 font-helvetica uppercase tracking-wider mb-3">Add Rating</p>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-white/40 font-helvetica">Rating:</span>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map((s) => (
                    <button key={s} type="button" onClick={() => setRating(s)}
                      className={cn("text-xl transition-colors", s <= rating ? "text-accent" : "text-white/20 hover:text-white/40")}>
                      ★
                    </button>
                  ))}
                </div>
                <span className="text-sm text-accent font-orbitron font-bold">{rating}/5</span>
              </div>
              <input
                type="text" value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Comment on delivery, quality, communication…"
                className="input-field mb-3"
              />
              <button onClick={handleAddRating} disabled={submitting} className="btn-primary text-xs px-4 py-2.5">
                {submitting ? "Submitting…" : "Submit Review"}
              </button>
            </div>

            {vendor.ratings.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {[...vendor.ratings].reverse().map((r) => (
                  <div key={r.id} className="px-4 py-3 bg-white/[0.02] border border-white/8 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-accent text-sm">{renderStars(r.rating)}</span>
                      <span className="text-xs font-semibold text-white/50 font-helvetica">{r.ratedByName}</span>
                      <span className="text-[10px] text-white/20 font-helvetica ml-auto">{formatProcDateTime(r.createdAt)}</span>
                    </div>
                    {r.comment && <p className="text-sm text-white/60 font-helvetica">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Contact</p>
            <div className="space-y-1.5 text-sm font-helvetica">
              <p className="text-white/60"><span className="text-white/30">Person: </span>{vendor.contactPerson}</p>
              <p className="text-white/60"><span className="text-white/30">Email: </span>{vendor.email}</p>
              <p className="text-white/60"><span className="text-white/30">Phone: </span>{vendor.phone}</p>
              <p className="text-white/60"><span className="text-white/30">Terms: </span>{vendor.paymentTerms || "—"}</p>
            </div>
          </div>
          {vendor.notes && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-white/50 font-helvetica leading-relaxed">{vendor.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BackIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
