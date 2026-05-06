"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import ChronixLogo from "@/components/ChronixLogo";
import type { Role } from "@/types/roles";
import { hasPermission } from "@/types/roles";

interface Props {
  children:               React.ReactNode;
  requiredPermission?:    string;
  /** Access if the user has any of these permissions (e.g. manage vs view). */
  requiredAnyPermission?: string[];
  allowedRoles?:          Role[];
}

/* ── Branded loading screen ─────────────────────────────────
   Shown while auth is resolving OR while a redirect is
   pending.  Never shows a blank screen.                      */
function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-primary-gradient flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <ChronixLogo size={52} />
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="font-orbitron text-xs text-white/30 tracking-widest uppercase">
          {message ?? "Loading…"}
        </p>
      </div>
    </div>
  );
}

/* ── Profile error screen ───────────────────────────────────
   Shown when Firebase Auth succeeded but Firestore profile
   could not be read (rules issue, network error, etc.).     */
function ProfileErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-primary-gradient flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-5 animate-fade-in max-w-sm text-center">
        <ChronixLogo size={52} />
        <h2 className="font-orbitron text-lg font-bold text-white">Profile Error</h2>
        <p className="text-white/40 text-sm font-helvetica">{error}</p>
        <p className="text-white/25 text-xs font-helvetica">
          Your account is authenticated but the Firestore profile could not be
          loaded. Check your Firestore security rules and ensure a{" "}
          <code className="text-accent/70">users/{"{uid}"}</code> document exists.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-helvetica rounded-xl transition-colors"
          >
            Retry
          </button>
          <a
            href="/login"
            className="px-5 py-2.5 border border-white/20 hover:border-white/40 text-white/60 hover:text-white text-sm font-helvetica rounded-xl transition-colors"
          >
            Sign Out
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── ProtectedRoute ─────────────────────────────────────────
   Guards a section of the app.

   State machine:
   1. loading=true            → show LoadingScreen (auth not yet resolved)
   2. !firebaseUser           → show LoadingScreen; effect redirects to /login
   3. firebaseUser + profileError → show ProfileErrorScreen
   4. firebaseUser + !profile → show LoadingScreen (profile still fetching or
                                 being created — extremely brief)
   5. profile + wrong role    → show LoadingScreen; effect redirects to /unauthorized
   6. profile + correct role  → render children

   We NEVER return null.  Every state shows something.       */
export default function ProtectedRoute({ children, requiredPermission, requiredAnyPermission, allowedRoles }: Props) {
  const { firebaseUser, profile, loading, profileError, signOut } = useAuth();
  const router = useRouter();

  function profileHasRequiredPermission(): boolean {
    if (!profile) return false;
    if (requiredAnyPermission?.length) {
      return requiredAnyPermission.some((p) => hasPermission(profile.role, p));
    }
    return !requiredPermission || hasPermission(profile.role, requiredPermission);
  }

  /* ── Determine access synchronously from current state ── */
  const isAuthenticated    = !loading && !!firebaseUser && !!profile;
  const hasRoleAccess      = !allowedRoles?.length      || (profile ? allowedRoles.includes(profile.role) : false);
  const hasPermAccess      = profileHasRequiredPermission();
  const isFullyAuthorized  = isAuthenticated && hasRoleAccess && hasPermAccess;

  /* ── Redirect side-effects (only run after auth resolved) ── */
  useEffect(() => {
    if (loading) return;                     // wait — auth not resolved yet
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (!profile && !profileError) return;   // profile still loading
    if (profileError) return;                // ProfileErrorScreen handles this
    if (!hasRoleAccess || !hasPermAccess) {
      router.replace("/unauthorized");
    }
  }, [loading, firebaseUser, profile, profileError, hasRoleAccess, hasPermAccess, router]);

  /* ── Render decisions — never return null ─────────────── */

  /* 1. Auth still resolving */
  if (loading) return <LoadingScreen message="Verifying session…" />;

  /* 2. Firestore profile error — show actionable screen */
  if (profileError) {
    return (
      <ProfileErrorScreen
        error={profileError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  /* 3. Not authenticated — show spinner while /login redirect fires */
  if (!firebaseUser || !profile) return <LoadingScreen message="Redirecting…" />;

  /* 4. Wrong role/permission — show spinner while /unauthorized redirect fires */
  if (!isFullyAuthorized) return <LoadingScreen message="Checking access…" />;

  /* 5. All checks passed — render the protected content */
  return <>{children}</>;
}
