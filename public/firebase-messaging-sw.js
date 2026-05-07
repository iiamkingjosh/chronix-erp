/* Firebase Cloud Messaging Service Worker — background push handler */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyB7gS6klWwkwG9XGt3Zlgv4QIaCwtyNDcY",
  authDomain:        "chronix-erp.firebaseapp.com",
  projectId:         "chronix-erp",
  storageBucket:     "chronix-erp.firebasestorage.app",
  messagingSenderId: "1078260639989",
  appId:             "1:1078260639989:web:c60e5f027d394fee25fdbc",
});

const messaging = firebase.messaging();

/* Handle push received while the app is in the background / closed */
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

/* Navigate to the linked page when user clicks the notification */
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
