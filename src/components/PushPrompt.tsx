"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { enablePushNotifications, getPushPermission, registerToken } from "@/lib/fcm-client";

const SNOOZE_KEY  = "push-prompt-snoozed-until";
const SNOOZE_DAYS = 7;

type State = "idle" | "enabling" | "done" | "hidden";

export default function PushPrompt() {
  const { profile }       = useAuth();
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (!profile) return;

    const perm = getPushPermission();
    if (perm === "granted" || perm === "denied" || perm === "unsupported") return;

    const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozedUntil && new Date(snoozedUntil) > new Date()) return;

    /* Show after 1.8 s so the dashboard has fully painted */
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, [profile]);

  async function handleEnable() {
    setState("enabling");
    try {
      const token = await enablePushNotifications();
      if (token) {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) await registerToken(token, idToken);
        setState("done");
        setTimeout(() => setVisible(false), 2200);
      } else {
        /* Permission denied by browser — snooze for 7 days */
        snooze();
      }
    } catch {
      snooze();
    }
  }

  function snooze() {
    const until = new Date();
    until.setDate(until.getDate() + SNOOZE_DAYS);
    localStorage.setItem(SNOOZE_KEY, until.toISOString());
    setVisible(false);
    setState("idle");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[340px] animate-fade-in">
      <div className="bg-[#111118] border border-white/15 rounded-2xl p-5 shadow-2xl shadow-black/60">
        {state === "done" ? (
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">✓</span>
            <div>
              <p className="text-sm font-semibold text-emerald-400 font-helvetica">Notifications enabled</p>
              <p className="text-xs text-white/30 font-helvetica mt-0.5">You will receive alerts even when the app is closed.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-xl shrink-0">
                🔔
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white font-helvetica">Enable Push Notifications</p>
                <p className="text-xs text-white/40 font-helvetica mt-1 leading-relaxed">
                  Get alerts for tax filing deadlines, subscription renewals, invoice updates, and activity — even when this tab is closed.
                </p>
              </div>
              <button
                onClick={snooze}
                className="text-white/20 hover:text-white/50 font-helvetica transition-colors text-lg leading-none shrink-0 -mt-0.5"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleEnable}
                disabled={state === "enabling"}
                className="flex-1 btn-primary text-xs py-2.5 disabled:opacity-50"
              >
                {state === "enabling" ? "Enabling…" : "Enable Notifications"}
              </button>
              <button
                onClick={snooze}
                className="px-4 text-xs text-white/30 hover:text-white/60 font-helvetica border border-white/10 hover:border-white/20 rounded-lg transition-colors"
              >
                Later
              </button>
            </div>

            <p className="text-[10px] text-white/20 font-helvetica mt-2.5 text-center">
              You can also enable this any time in Settings
            </p>
          </>
        )}
      </div>
    </div>
  );
}
