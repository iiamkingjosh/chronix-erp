import { getApps, cert, initializeApp, applicationDefault } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

function initAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID   ?? process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY)
    ?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return initializeApp({
    credential: applicationDefault(),
  });
}

let cachedApp: App | undefined;
let cachedAuth: Auth | undefined;
let cachedDb: Firestore | undefined;
let cachedMessaging: Messaging | undefined;

function getAdminApp(): App {
  if (!cachedApp) cachedApp = initAdminApp();
  return cachedApp;
}

/** Lazily initializes Firebase Admin — avoids crashing other routes at import time when credentials are missing. */
export function getAdminAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}

/** Lazily initializes Firestore (same app instance as {@link getAdminAuth}). */
export function getAdminDb(): Firestore {
  if (!cachedDb) cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}

/** Lazily initializes Firebase Messaging for server-side push notifications. */
export function getAdminMessaging(): Messaging {
  if (!cachedMessaging) cachedMessaging = getMessaging(getAdminApp());
  return cachedMessaging;
}
