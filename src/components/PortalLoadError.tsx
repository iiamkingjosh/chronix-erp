"use client";

import type { ClientPortalErrorKind } from "@/lib/client-portal-service";

interface Props {
  errorKind: ClientPortalErrorKind;
  onRetry?:  () => void;
}

/** Renders nothing for errorKind "none" - callers render their normal
 * content (including the genuine empty state) in that case. Never shows
 * a raw Firestore error to a client-facing screen. */
export default function PortalLoadError({ errorKind, onRetry }: Props) {
  if (errorKind === "none") return null;

  if (errorKind === "denied") {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-white/60 text-sm font-helvetica mb-1">Your account isn't fully set up yet.</p>
        <p className="text-white/30 text-xs font-helvetica">Please contact support so we can finish linking your account.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 text-center">
      <p className="text-white/60 text-sm font-helvetica mb-3">Something went wrong loading your data.</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-accent hover:underline font-helvetica">
          Try again
        </button>
      )}
    </div>
  );
}
