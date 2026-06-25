"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Genuine user activity, not background/tab-visibility noise — mousemove,
 * keydown, mousedown and scroll cover desktop use; touchstart covers
 * mobile. Deliberately excludes focus/visibilitychange, which can fire
 * from switching back to an idle background tab rather than real use. */
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "scroll", "touchstart"] as const;

/** mousemove fires very frequently — resetting two timers on every single
 * event is wasteful. Only re-arm once per second of continued activity. */
const THROTTLE_MS = 1_000;

const WARNING_AT_MS = 14 * 60 * 1000;
const LOGOUT_AT_MS  = 15 * 60 * 1000;

/** Warns 1 minute before an inactivity logout, then fires it. `active`
 * gates the whole mechanism — pass false (or don't mount it) for a
 * signed-out user, since there's nothing to time out. */
export function useInactivityLogout(active: boolean, onLogout: () => void): {
  showWarning: boolean;
  stayLoggedIn: () => void;
} {
  const [showWarning, setShowWarning] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReset      = useRef(0);

  const clearTimers = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (logoutTimer.current)  clearTimeout(logoutTimer.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    warningTimer.current = setTimeout(() => setShowWarning(true), WARNING_AT_MS);
    logoutTimer.current  = setTimeout(() => { setShowWarning(false); onLogout(); }, LOGOUT_AT_MS);
  }, [clearTimers, onLogout]);

  useEffect(() => {
    if (!active) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    resetTimers();

    function handleActivity() {
      const now = Date.now();
      if (now - lastReset.current < THROTTLE_MS) return;
      lastReset.current = now;
      resetTimers();
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }
    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity);
      }
      clearTimers();
    };
    // active is the only dependency that should re-run this effect —
    // resetTimers/clearTimers are stable via useCallback and re-creating
    // the listeners on every onLogout identity change would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { showWarning, stayLoggedIn: resetTimers };
}
