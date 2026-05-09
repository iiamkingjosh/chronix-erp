"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createStaffUser } from "@/lib/user-setup";
import { ROLES } from "@/types/roles";
import type { Role } from "@/types/roles";
import ChronixLogo from "@/components/ChronixLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/types/roles";

const ROLE_OPTIONS = Object.values(ROLES).filter((r) => r !== "Client" && r !== "Root Admin");

const schema = z
  .object({
    displayName:     z.string().min(2, "Full name is required"),
    email:           z.string().email("Enter a valid email address"),
    password:        z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    role:            z.enum(ROLE_OPTIONS as [Role, ...Role[]]),
    department:      z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

interface CreatedUser { displayName: string; email: string; role: Role; uid: string; }

const ROLE_COLORS: Record<string, string> = {
  "CEO":               "bg-purple-900/30 text-purple-300 border-purple-700/50",
  "CFO":               "bg-emerald-900/30 text-emerald-300 border-emerald-700/50",
  "System Admin":      "bg-blue-900/30 text-blue-300 border-blue-700/50",
  "Brand Lead":        "bg-orange-900/30 text-orange-300 border-orange-700/50",
  "Social Media Lead": "bg-pink-900/30 text-pink-300 border-pink-700/50",
  "HR":                "bg-teal-900/30 text-teal-300 border-teal-700/50",
  "Staff":             "bg-slate-700/30 text-slate-300 border-slate-600/50",
};

export default function CreateUserPage() {
  const { profile, loading, firebaseUser } = useAuth();
  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP === "true";
  const canUseSetup = !!profile && hasPermission(profile.role, "manage:settings");
  const [created, setCreated]         = useState<CreatedUser[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const setupGateError =
    !loading && (!isEnabled || !canUseSetup)
      ? "Setup tool is locked. Enable NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP=true and sign in as an admin."
      : null;

  const combinedError = serverError ?? setupGateError;

  async function onSubmit(data: FormData) {
    if (!isEnabled || !canUseSetup) return;
    setServerError(null);
    try {
      const idToken = await firebaseUser?.getIdToken();
      if (!idToken) {
        setServerError("You must be signed in to create users.");
        return;
      }
      const profile = await createStaffUser(idToken, {
        email:       data.email,
        password:    data.password,
        displayName: data.displayName,
        role:        data.role,
        department:  data.department,
      });
      setCreated((prev) => [...prev, {
        displayName: profile.displayName ?? profile.email,
        email:       profile.email,
        role:        profile.role,
        uid:         profile.uid,
      }]);
      reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("email-already-in-use")) {
        setServerError("An account with this email already exists.");
      } else if (msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")) {
        setServerError("Firestore permission denied. Update your security rules to allow writing to the users collection.");
      } else if (msg.includes("weak-password")) {
        setServerError("Password is too weak. Use at least 8 characters.");
      } else {
        setServerError(msg || "Failed to create account. Check your Firebase configuration.");
      }
    }
  }

  return (
    <main className="min-h-screen bg-primary-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-lg animate-slide-up">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <ChronixLogo size={44} />
          <div>
            <h1 className="font-orbitron text-xl font-bold text-white tracking-wide">Create Account</h1>
            <p className="text-white/40 text-xs font-helvetica mt-0.5">Chronix ERP — User Bootstrap</p>
          </div>
        </div>

        {/* Warning banner */}
        <div className="flex gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-5">
          <span className="text-amber-400 text-lg shrink-0">⚠</span>
          <p className="text-amber-300 text-sm font-helvetica">
            <strong className="text-amber-200">Setup tool.</strong> Keep this route disabled by default. Enable temporarily with{" "}
            <code className="text-amber-300/80 text-xs">NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP=true</code>{" "}
            and remove it after bootstrap.
          </p>
        </div>

        {/* Form */}
        <div className="glass-card p-6 mb-5">
          <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">
            New Staff Account
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            <div>
              <label className="field-label">Full Name</label>
              <input {...register("displayName")} placeholder="e.g. Joshua Adeyemi" className="input-field" />
              {errors.displayName && <p className="mt-1.5 text-xs text-red-400 font-helvetica">{errors.displayName.message}</p>}
            </div>

            <div>
              <label className="field-label">Email Address</label>
              <input {...register("email")} type="email" placeholder="user@chronixtech.com" className="input-field" />
              {errors.email && <p className="mt-1.5 text-xs text-red-400 font-helvetica">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Role</label>
                <select {...register("role")} className="input-field" defaultValue="">
                  <option value="" disabled className="bg-primary-dark">Select a role…</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r} className="bg-primary-dark text-white">{r}</option>
                  ))}
                </select>
                {errors.role && <p className="mt-1.5 text-xs text-red-400 font-helvetica">{errors.role.message}</p>}
              </div>

              <div>
                <label className="field-label">Department <span className="text-white/20 normal-case font-normal tracking-normal">(optional)</span></label>
                <input {...register("department")} placeholder="e.g. Finance" className="input-field" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Password</label>
                <input {...register("password")} type="password" placeholder="Min. 8 characters" className="input-field" />
                {errors.password && <p className="mt-1.5 text-xs text-red-400 font-helvetica">{errors.password.message}</p>}
              </div>
              <div>
                <label className="field-label">Confirm Password</label>
                <input {...register("confirmPassword")} type="password" placeholder="Repeat password" className="input-field" />
                {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-400 font-helvetica">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            {combinedError && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                <p className="text-red-400 text-sm font-helvetica">{combinedError}</p>
              </div>
            )}

            <button type="submit" disabled={isSubmitting || !isEnabled || !canUseSetup} className="btn-primary w-full mt-1">
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        {/* Created users log */}
        {created.length > 0 && (
          <div className="glass-card p-5 mb-4">
            <h2 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
              Created This Session ({created.length})
            </h2>
            <ul className="space-y-2">
              {created.map((u) => (
                <li key={u.uid} className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-semibold font-helvetica">{u.displayName}</p>
                    <p className="text-white/40 text-xs font-helvetica mt-0.5">{u.email} · {u.uid.slice(0, 8)}…</p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica",
                    ROLE_COLORS[u.role] ?? "bg-white/10 text-white/60 border-white/20"
                  )}>
                    {u.role}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
              <a href="/login" className="btn-primary text-center text-sm">
                Go to Login →
              </a>
              <p className="text-center text-white/20 text-xs font-helvetica">
                Done? Delete <code className="text-white/40">src/app/setup/</code> and{" "}
                <code className="text-white/40">src/lib/user-setup.ts</code>
              </p>
            </div>
          </div>
        )}

        {/* Firestore rules hint */}
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
          <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Firestore Rules Required</p>
          <pre className="text-[11px] text-white/40 font-mono leading-relaxed overflow-x-auto">{`See firestore.rules:
• Bootstrap create: Staff only, email == auth.token.email
• Self update: displayName / photoURL / lastLoginAt only
• Role changes + Root Admin: HR/CFO/Staff-admin paths;
  Root-like roles only via canManageStaff()
Setup uses POST /api/admin/users/create (Admin SDK).`}</pre>
        </div>
      </div>
    </main>
  );
}
