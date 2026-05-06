"use client";

import Link from "next/link";
import { COMPANY } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function SettingsPage() {
  const { profile } = useAuth();
  const canManageStaff = profile ? hasPermission(profile.role, "manage:staff") : false;

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
                { label: "System",   value: "Chronix ERP" },
                { label: "Version",  value: "v7.0" },
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
          {canManageStaff && (
            <div className="surface-card p-6">
              <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">User Management</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/setup/create-user" className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.07] hover:border-accent/20 transition-all group">
                  <span className="text-xl">➕</span>
                  <div>
                    <p className="text-sm text-white font-helvetica">Create User</p>
                    <p className="text-xs text-white/30 font-helvetica">Add staff or client account</p>
                  </div>
                </Link>
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
