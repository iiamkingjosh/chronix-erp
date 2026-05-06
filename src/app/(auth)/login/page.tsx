"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, sendReset } from "@/lib/auth-service";
import { ROLE_REDIRECTS, resolveRole } from "@/types/roles";
import ChronixLogo from "@/components/ChronixLogo";

const schema = z.object({
  email:    z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError]   = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const [resetting, setResetting]       = useState(false);

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormValues) {
    setServerError(null);
    try {
      const profile    = await signIn(data.email, data.password);
      const canonical  = resolveRole(profile.role);
      router.replace(ROLE_REDIRECTS[canonical] ?? "/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid-credential") || msg.includes("user-not-found") || msg.includes("wrong-password")) {
        setServerError("Incorrect email or password. Please try again.");
      } else if (msg.includes("too-many-requests")) {
        setServerError("Too many failed attempts. Try again later or reset your password.");
      } else if (msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")) {
        setServerError("Firestore access denied. Check security rules in Firebase Console.");
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    }
  }

  async function handleForgotPassword() {
    const email = getValues("email");
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setServerError("Enter your email address first, then click Forgot password.");
      return;
    }
    setResetting(true);
    setServerError(null);
    try {
      await sendReset(email);
      setResetSent(true);
    } catch {
      setServerError("Could not send reset email. Contact your administrator.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-primary-dark overflow-hidden">

      {/* ═══════════════════════════════════════════
          LEFT PANEL — Brand showcase
      ═══════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 bg-primary-gradient overflow-hidden">

        {/* Circuit grid background */}
        <CircuitGrid />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-accent/8 blur-[80px]" />
        </div>

        {/* Top: Wordmark */}
        <div className="relative z-10 animate-slide-right">
          <div className="flex items-center gap-4 mb-3">
            <ChronixLogo size={52} />
            <div>
              <h1 className="font-orbitron text-2xl font-black tracking-[0.15em] text-white leading-none">
                CHRONIX
              </h1>
              <p className="font-orbitron text-[11px] font-medium tracking-[0.3em] text-secondary mt-0.5">
                TECHNOLOGY LIMITED
              </p>
            </div>
          </div>
        </div>

        {/* Centre: Hero copy */}
        <div className="relative z-10 animate-fade-in">
          {/* OS badge */}
          <div className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-orbitron text-[11px] font-semibold tracking-[0.2em] text-accent">
              CHRONIX ERP · v1.0
            </span>
          </div>

          <h2 className="font-orbitron text-4xl xl:text-5xl font-black text-white leading-[1.15] mb-5">
            Your Business.<br />
            <span className="text-accent">Unified.</span>
          </h2>
          <p className="text-white/50 text-base leading-relaxed max-w-sm font-helvetica">
            The internal management platform for Chronix Technology — finance, HR, brand, and operations in one place.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {["Finance", "HR", "Brand", "Operations", "Reports"].map((f) => (
              <span
                key={f}
                className="text-xs font-medium text-white/40 border border-white/10 rounded-full px-3 py-1 font-helvetica"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom: Location */}
        <div className="relative z-10 flex items-center gap-2 animate-fade-in">
          <LocationIcon />
          <span className="text-white/30 text-xs font-helvetica tracking-wide">
            Lekki Phase 1, Lagos · Nigeria
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          RIGHT PANEL — Login form
      ═══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 lg:px-16 bg-primary-mid relative">

        {/* Mobile logo — only visible below lg */}
        <div className="lg:hidden flex items-center gap-3 mb-10 animate-fade-in">
          <ChronixLogo size={40} />
          <span className="font-orbitron text-lg font-black tracking-[0.15em] text-white">CHRONIX ERP</span>
        </div>

        <div className="w-full max-w-[400px] animate-slide-up">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="font-orbitron text-2xl font-bold text-white tracking-wide mb-2">
              Welcome back
            </h2>
            <p className="text-white/40 text-sm font-helvetica">
              Sign in to your Chronix ERP workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                  <MailIcon />
                </span>
                <input
                  {...register("email")}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@chronixtech.com"
                  className="input-field pl-10"
                />
              </div>
              {errors.email && (
                <p className="mt-2 text-xs text-red-400 font-helvetica">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase font-helvetica">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="text-[11px] text-accent hover:text-accent/80 font-helvetica transition-colors disabled:opacity-50"
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                  <LockIcon />
                </span>
                <input
                  {...register("password")}
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className="input-field pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-xs text-red-400 font-helvetica">{errors.password.message}</p>
              )}
            </div>

            {/* Alerts */}
            {serverError && (
              <div className="flex gap-2.5 items-start bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 animate-fade-in">
                <AlertIcon className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-400 text-xs leading-relaxed font-helvetica">{serverError}</p>
              </div>
            )}
            {resetSent && !serverError && (
              <div className="flex gap-2.5 items-start bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3 animate-fade-in">
                <CheckIcon className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-emerald-400 text-xs leading-relaxed font-helvetica">
                  Password reset link sent to your email.
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="relative w-full mt-2 bg-accent hover:bg-accent-hover
                         text-white font-semibold text-sm rounded-xl py-4
                         flex items-center justify-center gap-2
                         transition-all duration-200 active:scale-[0.98]
                         shadow-glow-accent animate-pulse-glow
                         disabled:opacity-60 disabled:cursor-not-allowed font-helvetica"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-center text-white/20 text-xs font-helvetica">
              Access is restricted to authorised Chronix Technology personnel.
              <br />
              Contact{" "}
              <span className="text-secondary">your System Administrator</span>{" "}
              if you need access.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-white/15 text-[11px] font-helvetica tracking-wide">
          © {new Date().getFullYear()} Chronix Technology Limited · All rights reserved
        </p>
      </div>
    </div>
  );
}

/* ── Decorative circuit grid (left panel bg) ── */
function CircuitGrid() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/>
        </pattern>
        <pattern id="dots" width="48" height="48" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="1.2" fill="white" />
          <circle cx="48" cy="0" r="1.2" fill="white" />
          <circle cx="0" cy="48" r="1.2" fill="white" />
          <circle cx="48" cy="48" r="1.2" fill="white" />
          <circle cx="24" cy="24" r="0.8" fill="white" opacity="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

/* ── Inline SVG icons ── */
function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m2 7 10 7 10-7"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="10"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
    </svg>
  );
}
function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
      <path d="M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
