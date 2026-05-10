"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createStaffUser } from "@/lib/user-setup";
import { ROLES, isRootAdmin, hasPermission, type Role } from "@/types/roles";
import ChronixLogo from "@/components/ChronixLogo";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

function rolesSelectableByCaller(rawRole: string): Role[] {
  const internal = Object.values(ROLES).filter((r) => r !== ROLES.CLIENT);
  if (isRootAdmin(rawRole)) return internal;
  return internal.filter((r) => r !== ROLES.ROOT_ADMIN);
}

const schema = z
  .object({
    displayName:     z.string().min(2, "Full name is required"),
    email:           z.string().email("Enter a valid email address"),
    password:        z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    role:            z.string().min(1, "Select a role"),
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
  "Sales Rep":         "bg-cyan-900/30 text-cyan-300 border-cyan-700/50",
  "Project Manager":   "bg-indigo-900/30 text-indigo-300 border-indigo-700/50",
  "Finance Officer":   "bg-lime-900/30 text-lime-300 border-lime-700/50",
  "IT Manager":        "bg-rose-900/30 text-rose-300 border-rose-700/50",
  "Root Admin":        "bg-red-900/30 text-red-300 border-red-700/50",
};

export default function CreateUserPage() {
  const { profile, loading, firebaseUser } = useAuth();
  /** User provisioning is on by default; set NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP=false to lock the UI. */
  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP !== "false";
  const canUseSetup =
    !!profile &&
    (hasPermission(profile.role, "manage:settings") ||
      hasPermission(profile.role, "manage:hr") ||
      isRootAdmin(profile.role));
  const [created, setCreated]         = useState<CreatedUser[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const setupGateError =
    !loading && (!isEnabled || !canUseSetup)
      ? !isEnabled
        ? "User provisioning is disabled (NEXT_PUBLIC_ENABLE_SETUP_BOOTSTRAP=false)."
        : "Sign in as Root Admin, System Admin, or HR to create accounts."
      : null;

  const roleOptions = profile ? rolesSelectableByCaller(profile.role) : [];

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
      if (!roleOptions.includes(data.role as Role)) {
        setServerError("Invalid role for your account.");
        return;
      }
      const newUser = await createStaffUser(idToken, {
        email:       data.email,
        password:    data.password,
        displayName: data.displayName,
        role:        data.role as Role,
        department:  data.department,
      });
      setCreated((prev) => [...prev, {
        displayName: newUser.displayName ?? newUser.email,
        email:       newUser.email,
        role:        newUser.role,
        uid:         newUser.uid,
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
            <p className="text-white/40 text-xs font-helvetica mt-0.5">
              Create an internal Chronix ERP account · {APP_VERSION_SHORT_LABEL}
            </p>
          </div>
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
                  {roleOptions.map((r) => (
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
              <Link href="/dashboard" className="text-center text-white/35 hover:text-white/55 text-xs font-helvetica transition-colors">
                Back to dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
