"use client";

import { getMessaging, getToken } from "firebase/messaging";
import app from "@/lib/firebase";

export type PermissionStatus = "granted" | "denied" | "default" | "unsupported";

export function getPushPermission(): PermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Request permission, register service worker, return FCM token or null. */
export async function enablePushNotifications(): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const sw  = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const msg = getMessaging(app);
    return await getToken(msg, {
      vapidKey:                    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration:   sw,
    });
  } catch {
    return null;
  }
}

/** Send the FCM token to the server to associate with this user. */
export async function registerToken(token: string, idToken: string): Promise<void> {
  await fetch("/api/notifications/register-token", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body:    JSON.stringify({ token }),
  });
}

/** Re-fetches this device's FCM token without re-requesting permission -
 * getToken() returns the same stable token for an already-registered
 * service worker rather than minting a new one, which is what lets
 * logout identify exactly which token to remove (the token itself is
 * never cached anywhere client-side between registration and logout). */
export async function getCurrentPushToken(): Promise<string | null> {
  try {
    if (getPushPermission() !== "granted") return null;
    const sw = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!sw) return null;
    const msg = getMessaging(app);
    return await getToken(msg, {
      vapidKey:                  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
  } catch {
    return null;
  }
}

/** Tell the server to drop this device's token - best-effort, called
 * from signOutUser() before the session ends. */
export async function unregisterToken(token: string, idToken: string): Promise<void> {
  await fetch("/api/notifications/unregister-token", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body:    JSON.stringify({ token }),
  });
}
