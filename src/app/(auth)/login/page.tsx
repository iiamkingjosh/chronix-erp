"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, signUp, sendReset } from "@/lib/auth-service";
import { auth } from "@/lib/firebase";
import { APP_VERSION_SHORT_LABEL } from "@/lib/app-version";
import { ROLE_REDIRECTS, resolveRole } from "@/types/roles";
import ChronixLogo from "@/components/ChronixLogo";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email:    z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type LoginValues = z.infer<typeof loginSchema>;

const registerSchema = z
  .object({
    displayName:     z.string().min(2, "Full name is required"),
    email:           z.string().email("Enter a valid email address"),
    password:        z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type RegisterValues = z.infer<typeof registerSchema>;

/** Next.js 16: `useSearchParams()` must sit under Suspense for static prerender. */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPrerenderFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPrerenderFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-dark">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <ChronixLogo size={48} />
        <p className="font-orbitron text-[10px] text-white/30 tracking-widest uppercase">Loading…</p>
      </div>
    </div>
  );
}

function LoginPageInner() {
  const router          = useRouter();
  const pathname        = usePathname();
  const searchParams    = useSearchParams();
  const selfSignupOn = process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP !== "false";

  const [mode, setMode] = useState<"signin" | "register">("signin");

  useEffect(() => {
    if (!selfSignupOn) {
      setMode("signin");
      return;
    }
    const wr =
      searchParams.get("mode") === "register" ||
      searchParams.get("register") === "1" ||
      searchParams.get("register") === "true";
    setMode(wr ? "register" : "signin");
  }, [searchParams, selfSignupOn]);

  const [serverError, setServerError]   = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const [resetting, setResetting]       = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail]         = useState("");
  const [resetError, setResetError]         = useState<string | null>(null);

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const regForm   = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const goSignIn = useCallback(() => {
    setMode("signin");
    setServerError(null);
    regForm.reset();
    router.replace(pathname);
  }, [pathname, regForm, router]);

  const goRegister = useCallback(() => {
    setMode("register");
    setServerError(null);
    loginForm.reset();
    setResetSent(false);
    router.replace(`${pathname}?mode=register`);
  }, [loginForm, pathname, router]);

  useEffect(() => {
    if (!searchParams?.toString()) return;
    if (searchParams.has("email") || searchParams.has("password")) {
      router.replace(pathname + (mode === "register" ? "?mode=register" : ""));
    }
  }, [pathname, router, searchParams, mode]);

  async function onSignIn(data: LoginValues) {
    setServerError(null);
    try {
      const profile   = await signIn(data.email, data.password);
      const canonical = resolveRole(profile.role);
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

  async function onRegister(data: RegisterValues) {
    if (!selfSignupOn) return;
    setServerError(null);
    try {
      const profile   = await signUp(data.email, data.password, data.displayName);
      const canonical = resolveRole(profile.role);

      // Welcome email — awaited but never allowed to block registration or
      // throw past this point. Routed through a server API (not a direct
      // client call to sendEmail()) because RESEND_API_KEY is server-only
      // and must never reach the browser bundle.
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch("/api/auth/send-welcome-email", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) {
        console.error("[onRegister] welcome email request failed:", e);
      }

      router.replace(ROLE_REDIRECTS[canonical] ?? "/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("email-already-in-use")) {
        setServerError("An account with this email already exists. Use Sign in.");
      } else if (msg.includes("weak-password") || msg.includes("weak_password")) {
        setServerError("Password is too weak. Use at least 8 characters.");
      } else if (msg.includes("permission-denied") || msg.includes("PERMISSION_DENIED")) {
        setServerError("Registration was blocked. Ask an administrator.");
      } else {
        setServerError(msg || "Could not create account. Try again.");
      }
    }
  }

  function openResetModal() {
    setResetEmail(loginForm.getValues("email") ?? "");
    setResetError(null);
    setResetModalOpen(true);
  }

  function closeResetModal() {
    setResetModalOpen(false);
    setResetError(null);
  }

  async function handleSendReset() {
    if (!resetEmail || !/\S+@\S+\.\S+/.test(resetEmail)) {
      setResetError("Enter a valid email address.");
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await sendReset(resetEmail);
      setResetModalOpen(false);
      setResetSent(true);
      setServerError(null);
    } catch {
      setResetError("Could not send reset email. Contact your administrator.");
    } finally {
      setResetting(false);
    }
  }

  const loginSubmitting   = loginForm.formState.isSubmitting;
  const registerSubmitting = regForm.formState.isSubmitting;

  return (
    <div className="min-h-screen flex bg-primary-dark overflow-hidden">

      {/* ═══════════════════════════════════════════
          LEFT PANEL — Brand showcase
      ═══════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 bg-primary-gradient overflow-hidden">

        <CircuitGrid />

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-accent/8 blur-[80px]" />
        </div>

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

        <div className="relative z-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-orbitron text-[11px] font-semibold tracking-[0.2em] text-accent">
              CHRONIX ERP · {APP_VERSION_SHORT_LABEL}
            </span>
          </div>

          <h2 className="font-orbitron text-4xl xl:text-5xl font-black text-white leading-[1.15] mb-5">
            Your Business.<br />
            <span className="text-accent">Unified.</span>
          </h2>
          <p className="text-white/50 text-base leading-relaxed max-w-sm font-helvetica">
            The internal management platform for Chronix Technology — finance, HR, brand, and operations in one place.
          </p>

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

        <div className="relative z-10 flex items-center gap-2 animate-fade-in">
          <LocationIcon />
          <span className="text-white/30 text-xs font-helvetica tracking-wide">
            Lekki Phase 1, Lagos · Nigeria
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          RIGHT PANEL — Sign in / Create account
      ═══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 lg:px-16 bg-primary-mid relative">

        <div className="lg:hidden flex items-center gap-3 mb-10 animate-fade-in">
          <ChronixLogo size={40} />
          <div>
            <span className="font-orbitron text-lg font-black tracking-[0.15em] text-white block leading-tight">CHRONIX ERP</span>
            <span className="font-orbitron text-[10px] tracking-[0.2em] text-secondary">{APP_VERSION_SHORT_LABEL}</span>
          </div>
        </div>

        <div className="w-full max-w-[400px] animate-slide-up">

          <div className="mb-6">
            <h2 className="font-orbitron text-2xl font-bold text-white tracking-wide mb-2">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-white/40 text-sm font-helvetica">
              {mode === "signin"
                ? "Sign in to your Chronix ERP workspace"
                : "You’ll join as Staff — HR can update role and payroll later"}
            </p>
          </div>

          {selfSignupOn && (
            <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/10 mb-6">
              <button
                type="button"
                onClick={goSignIn}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-helvetica font-medium transition-all",
                  mode === "signin"
                    ? "bg-accent/20 text-accent border border-accent/25 shadow-sm"
                    : "text-white/45 hover:text-white/70 border border-transparent",
                )}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={goRegister}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-helvetica font-medium transition-all",
                  mode === "register"
                    ? "bg-accent/20 text-accent border border-accent/25 shadow-sm"
                    : "text-white/45 hover:text-white/70 border border-transparent",
                )}
              >
                Create account
              </button>
            </div>
          )}

          {!selfSignupOn && mode === "register" ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 mb-6">
              <p className="text-white/50 text-sm font-helvetica leading-relaxed">
                Self-registration is disabled for this deployment. Sign in with credentials from your administrator.
              </p>
            </div>
          ) : null}

          {mode === "signin" ? (
            <form
              method="post"
              action="#"
              onSubmit={loginForm.handleSubmit(onSignIn)}
              noValidate
              className="space-y-5"
            >
              <div>
                <label htmlFor="login-email" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <MailIcon />
                  </span>
                  <input
                    {...loginForm.register("email")}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@chronixtech.com"
                    className="input-field pl-10"
                  />
                </div>
                {loginForm.formState.errors.email && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{loginForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="login-password" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase font-helvetica">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={openResetModal}
                    className="text-[11px] text-accent hover:text-accent/80 font-helvetica transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <LockIcon />
                  </span>
                  <input
                    {...loginForm.register("password")}
                    id="login-password"
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
                {loginForm.formState.errors.password && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

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

              <button
                type="submit"
                disabled={loginSubmitting}
                className="relative w-full mt-2 bg-accent hover:bg-accent-hover
                           text-white font-semibold text-sm rounded-xl py-4
                           flex items-center justify-center gap-2
                           transition-all duration-200 active:scale-[0.98]
                           shadow-glow-accent animate-pulse-glow
                           disabled:opacity-60 disabled:cursor-not-allowed font-helvetica"
              >
                {loginSubmitting ? (
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
          ) : selfSignupOn ? (
            <form onSubmit={regForm.handleSubmit(onRegister)} noValidate className="space-y-5">
              <div>
                <label htmlFor="reg-name" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                  Full name
                </label>
                <input
                  {...regForm.register("displayName")}
                  id="reg-name"
                  autoComplete="name"
                  placeholder="e.g. Joshua Adeyemi"
                  className="input-field"
                />
                {regForm.formState.errors.displayName && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{regForm.formState.errors.displayName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="reg-email" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <MailIcon />
                  </span>
                  <input
                    {...regForm.register("email")}
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@chronixtech.com"
                    className="input-field pl-10"
                  />
                </div>
                {regForm.formState.errors.email && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{regForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="reg-password" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <LockIcon />
                  </span>
                  <input
                    {...regForm.register("password")}
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
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
                {regForm.formState.errors.password && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{regForm.formState.errors.password.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="reg-confirm" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
                  Confirm password
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <LockIcon />
                  </span>
                  <input
                    {...regForm.register("confirmPassword")}
                    id="reg-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    className="input-field pl-10"
                  />
                </div>
                {regForm.formState.errors.confirmPassword && (
                  <p className="mt-2 text-xs text-red-400 font-helvetica">{regForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              {serverError && (
                <div className="flex gap-2.5 items-start bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 animate-fade-in">
                  <AlertIcon className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-400 text-xs leading-relaxed font-helvetica">{serverError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={registerSubmitting}
                className="relative w-full mt-2 bg-accent hover:bg-accent-hover
                           text-white font-semibold text-sm rounded-xl py-4
                           flex items-center justify-center gap-2
                           transition-all duration-200 active:scale-[0.98]
                           shadow-glow-accent animate-pulse-glow
                           disabled:opacity-60 disabled:cursor-not-allowed font-helvetica"
              >
                {registerSubmitting ? (
                  <>
                    <Spinner />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowIcon />
                  </>
                )}
              </button>
            </form>
          ) : null}

          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-center text-white/20 text-xs font-helvetica leading-relaxed">
              Access is restricted to authorised Chronix Technology personnel.
              <br />
              After you&apos;re signed in, open{" "}
              <Link href="/dashboard/settings" className="text-secondary hover:underline">
                Settings
              </Link>
              {" "}for shortcuts to HR and notifications.
            </p>
          </div>
        </div>

        <p className="absolute bottom-6 text-white/15 text-[11px] font-helvetica tracking-wide text-center w-full px-4">
          © {new Date().getFullYear()} Chronix Technology Limited · All rights reserved · {APP_VERSION_SHORT_LABEL}
        </p>
      </div>

      {/* ═══════════════════════════════════════════
          Forgot password modal
      ═══════════════════════════════════════════ */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="surface-card w-full max-w-sm p-6 bg-primary-mid border border-white/10 rounded-2xl">
            <h3 className="font-orbitron text-sm font-bold text-white mb-2">Reset your password</h3>
            <p className="text-white/40 text-xs font-helvetica mb-4 leading-relaxed">
              Enter your account email and we&apos;ll send you a link to reset your password.
            </p>
            <label htmlFor="reset-email" className="block text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase mb-2 font-helvetica">
              Email Address
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@chronixtech.com"
              className="input-field mb-3"
            />
            {resetError && (
              <p className="mb-3 text-xs text-red-400 font-helvetica">{resetError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetting}
                className="text-xs text-white/40 hover:text-white font-helvetica px-3 py-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReset}
                disabled={resetting}
                className="btn-primary text-xs px-5 py-2 disabled:opacity-50"
              >
                {resetting ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </div>
        </div>
      )}
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
