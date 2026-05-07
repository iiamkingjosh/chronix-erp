import { NextResponse } from "next/server";

/**
 * Serves the FCM service worker at /firebase-messaging-sw.js
 * Injects Firebase config from environment variables so no credentials
 * are hardcoded in source files or committed to git.
 */
export async function GET() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "",
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "",
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "",
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "",
  };

  const js = `
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title = "Chronix ERP", body = "" } = payload.notification ?? {};
  self.registration.showNotification(title, {
    body,
    icon:  "/chronix-icon.png",
    badge: "/chronix-icon.png",
    data:  { link: payload.data?.link ?? "/dashboard" },
    requireInteraction: true,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.link ?? "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else           { clients.openWindow(url); }
    }),
  );
});
`.trim();

  return new NextResponse(js, {
    headers: {
      "Content-Type":          "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control":          "no-cache, no-store, must-revalidate",
    },
  });
}
