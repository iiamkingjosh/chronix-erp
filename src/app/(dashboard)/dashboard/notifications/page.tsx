"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getNotifications, markRead, markAllRead } from "@/lib/notifications-service";
import {
  NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_STYLES, NOTIFICATION_TYPE_ICONS,
} from "@/types/notifications";
import type { AppNotification, NotificationType } from "@/types/notifications";
import { cn } from "@/lib/utils";
import ProtectedRoute from "@/components/ProtectedRoute";

type Filter = "all" | "unread" | NotificationType;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60_000);
  const h  = Math.floor(ms / 3_600_000);
  const d  = Math.floor(ms / 86_400_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export default function NotificationsPage() {
  const { profile }                           = useAuth();
  const [notifs, setNotifs]                   = useState<AppNotification[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [filter, setFilter]                   = useState<Filter>("all");
  const [markingAll, setMarkingAll]           = useState(false);

  useEffect(() => {
    if (!profile) return;
    getNotifications(profile.role).then(setNotifs).finally(() => setLoading(false));
  }, [profile]);

  const filtered = notifs.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter !== "all")    return n.type === filter;
    return true;
  });

  const unreadCount = notifs.filter((n) => !n.read).length;

  async function handleMarkRead(id: string) {
    await markRead(id);
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    const ids = notifs.filter((n) => !n.read).map((n) => n.id);
    await markAllRead(ids);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setMarkingAll(false);
  }

  const TYPE_FILTERS: { label: string; value: Filter }[] = [
    { label: "All",        value: "all" },
    { label: "Unread",     value: "unread" },
    { label: "Invoices",   value: "invoice_overdue" },
    { label: "Renewals",   value: "subscription_expiring" },
    { label: "SLA",        value: "sla_breach" },
    { label: "Leads",      value: "new_lead" },
    { label: "Milestones", value: "milestone_complete" },
  ];

  return (
    <ProtectedRoute requiredPermission="view:notifications">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-orbitron text-2xl font-bold text-white">Notification Centre</h1>
            <p className="text-white/40 text-sm font-helvetica mt-1">
              System alerts, reminders and activity feed
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="text-xs text-white/40 hover:text-white font-helvetica border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              {markingAll ? "Marking…" : `Mark all read (${unreadCount})`}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-helvetica border transition-colors",
                filter === f.value
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "text-white/30 border-white/10 hover:text-white hover:border-white/20"
              )}
            >
              {f.label}
              {f.value === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 bg-accent text-white text-[9px] font-orbitron font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card px-6 py-16 text-center">
            <p className="text-white/20 text-sm font-helvetica">
              {filter === "unread" ? "All caught up! No unread notifications." : "No notifications found."}
            </p>
          </div>
        ) : (
          <div className="surface-card overflow-hidden divide-y divide-white/5">
            {filtered.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex gap-4 px-5 py-4 transition-colors",
                  !n.read && "bg-white/[0.02]",
                  n.read && "opacity-60"
                )}
              >
                <div className="shrink-0 mt-0.5 text-xl leading-none">
                  {NOTIFICATION_TYPE_ICONS[n.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white font-helvetica leading-tight">{n.title}</p>
                      <p className="text-xs text-white/50 font-helvetica mt-0.5">{n.message}</p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica shrink-0 mt-0.5", NOTIFICATION_TYPE_STYLES[n.type])}>
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-white/25 font-helvetica">{timeAgo(n.createdAt)}</span>
                    {n.link && (
                      <Link href={n.link} className="text-[10px] text-accent hover:underline font-helvetica">
                        View →
                      </Link>
                    )}
                    {!n.read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-[10px] text-white/30 hover:text-white font-helvetica transition-colors"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <div className="shrink-0 w-2 h-2 rounded-full bg-accent mt-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
