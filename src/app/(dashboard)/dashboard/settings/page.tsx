"use client";

import Link from "next/link";
import { useState } from "react";
import { APP_VERSION_SEMVER } from "@/lib/app-version";
import { COMPANY } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { ROLES, hasPermission, isRootAdmin, resolveRole } from "@/types/roles";
import { auth } from "@/lib/firebase";
import { enablePushNotifications, getPushPermission, registerToken, type PermissionStatus } from "@/lib/fcm-client";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function SettingsPage() {
  const { profile }    = useAuth();
  const canManageStaff = profile ? hasPermission(profile.role, "manage:staff") : false;
  const canInviteUsers =
    !!profile &&
    (canManageStaff ||
      hasPermission(profile.role, "manage:hr") ||
      isRootAdmin(profile.role) ||
      resolveRole(profile.role) === ROLES.STAFF);

  const [pushStatus, setPushStatus]   = useState<PermissionStatus>(
    () => (typeof window !== "undefined" ? getPushPermission() : "default"),
  );
  const [enabling, setEnabling]       = useState(false);
  const [testing, setTesting]         = useState(false);
  const [pushMsg, setPushMsg]         = useState<string | null>(null);

  async function handleTestNotification() {
    setTesting(true);
    setPushMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { setPushMsg("Not authenticated."); return; }
      const res  = await fetch("/api/notifications/test", {
        method:  "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json() as { success?: boolean; results?: Record<string, string>; error?: string };
      if (json.success) {
        const r = json.results ?? {};
        setPushMsg(`Test sent — in-app: ${r.inApp} · push: ${r.push} · email: ${r.email}`);
      } else {
        setPushMsg(`Error: ${json.error}`);
      }
    } catch (e) {
      setPushMsg(`Failed: ${String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleEnablePush() {
    setEnabling(true);
    setPushMsg(null);
    try {
      const token = await enablePushNotifications();
      if (!token) {
        setPushMsg("Permission denied or browser not supported.");
        setPushStatus(getPushPermission());
        return;
      }
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) await registerToken(token, idToken);
      setPushStatus("granted");
      setPushMsg("Push notifications enabled! You'll receive alerts even when the app is closed.");
    } catch {
      setPushMsg("Something went wrong. Please try again.");
    } finally {
      setEnabling(false);
    }
  }

  return (
    <ProtectedRoute requiredAnyPermission={["manage:settings", "view:settings"]}>
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="font-orbitron text-2xl font-bold text-white">Settings</h1>
          <p className="text-white/40 text-sm font-helvetica mt-1">Platform configuration and administration</p>
        </div>

        <div className="space-y-5">
          {/* Company Profile */}
          <div className="surface-card p-6">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Company Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Company Name",   value: COMPANY.name },
                { label: "Address",        value: COMPANY.address },
                { label: "Phone",          value: COMPANY.phone },
                { label: "Email",          value: COMPANY.email },
                { label: "Website",        value: COMPANY.website },
                { label: "TIN",            value: COMPANY.bank.tin },
                { label: "Bank",           value: COMPANY.bank.name },
                { label: "Account Number", value: COMPANY.bank.account },
                { label: "Account Name",   value: COMPANY.bank.accountName },
              ].map((row) => (
                <div key={row.label} className="sm:col-span-1">
                  <p className="text-white/30 text-xs font-helvetica uppercase tracking-wider mb-0.5">{row.label}</p>
                  <p className="text-sm text-white font-helvetica">{row.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/20 font-helvetica">
                Company profile information is maintained by administrators. If any details are incorrect, please notify your admin so it can be updated.
              </p>
            </div>
          </div>

          {/* Platform Info */}
          <div className="surface-card p-6">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Platform</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "System",   value: "Chronix OS" },
                { label: "Version",  value: `v${APP_VERSION_SEMVER}` },
                { label: "Stack",    value: "Next.js + Firebase" },
                { label: "Currency", value: "₦ Naira (NGN)" },
              ].map((row) => (
                <div key={row.label} className="surface-card p-4 bg-white/[0.02] text-center">
                  <p className="font-orbitron text-sm font-bold text-white">{row.value}</p>
                  <p className="text-white/30 text-[10px] font-helvetica mt-1">{row.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* User Management */}
          {canInviteUsers && (
            <div className="surface-card p-6">
              <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">User Management</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/dashboard/hr" className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
                  <span className="text-xl">👥</span>
                  <div>
                    <p className="text-sm text-white font-helvetica">Employee Profiles</p>
                    <p className="text-xs text-white/30 font-helvetica">Manage HR records</p>
                  </div>
                </Link>
                <Link href="/dashboard/notifications" className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
                  <span className="text-xl">🔔</span>
                  <div>
                    <p className="text-sm text-white font-helvetica">Notifications</p>
                    <p className="text-xs text-white/30 font-helvetica">View all system alerts</p>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Push Notifications */}
          <div className="surface-card p-6">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Push Notifications</h2>
            <div className="flex items-start gap-5">
              <div className="flex-1">
                <p className="text-sm text-white font-helvetica mb-1">Browser Push Notifications</p>
                <p className="text-xs text-white/40 font-helvetica leading-relaxed">
                  Receive tax filing reminders, subscription alerts, and activity notifications directly in your browser — even when the app is closed.
                </p>
                {pushMsg && (
                  <p className={`mt-2 text-xs font-helvetica ${pushStatus === "granted" ? "text-emerald-400" : "text-red-400"}`}>
                    {pushMsg}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {pushStatus === "unsupported" && (
                  <span className="text-xs text-white/20 font-helvetica">Not supported in this browser</span>
                )}
                {pushStatus === "denied" && (
                  <span className="text-xs text-red-400/70 font-helvetica">Blocked — enable in browser settings</span>
                )}
                {pushStatus === "granted" && (
                  <span className="flex items-center gap-2 text-xs text-emerald-400 font-helvetica">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Active
                  </span>
                )}
                {pushStatus === "default" && (
                  <button
                    onClick={handleEnablePush}
                    disabled={enabling}
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
                  >
                    {enabling ? "Enabling…" : "Enable Push"}
                  </button>
                )}
                {pushStatus === "granted" && (
                  <button
                    onClick={handleTestNotification}
                    disabled={testing}
                    className="text-xs border border-secondary/30 text-secondary hover:bg-secondary/10 px-4 py-2 rounded-lg font-helvetica transition-colors disabled:opacity-50"
                  >
                    {testing ? "Sending…" : "Send Test"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* VAT & Finance */}
          <div className="surface-card p-6">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Finance Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "VAT Rate",      value: "7.5%" },
                { label: "Invoice Prefix", value: "CT" },
                { label: "Default Due",   value: "30 days" },
              ].map((row) => (
                <div key={row.label} className="px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl">
                  <p className="text-white/30 text-xs font-helvetica">{row.label}</p>
                  <p className="text-sm font-semibold text-white font-helvetica mt-0.5">{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div className="surface-card p-6">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Quick Links</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Analytics",     href: "/dashboard/analytics",    icon: "📊" },
                { label: "Subscriptions", href: "/dashboard/subscriptions", icon: "🔔" },
                { label: "Tickets",       href: "/dashboard/tickets",       icon: "🎫" },
                { label: "Finance",       href: "/dashboard/finance",       icon: "💰" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/8 rounded-xl hover:border-accent/20 hover:bg-white/[0.06] transition-all text-sm text-white/60 hover:text-white font-helvetica">
                  <span>{l.icon}</span>{l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
