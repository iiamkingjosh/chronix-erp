/**
 * Connects the Firebase Admin SDK (used by the payslip/performance API
 * routes via src/lib/firebase-admin.ts) to the local emulators. The Admin
 * SDK auto-detects FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * env vars and skips real-credential verification entirely in that mode —
 * but only if initializeApp() doesn't choke on missing credentials first.
 * This must run before firebase-admin.ts is ever imported.
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-chronix-test";
process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-chronix-test";
// Deliberately no client_email/private_key — forces the applicationDefault()
// fallback path in initAdminApp(), which is the thing we're checking works
// under emulator conditions with zero real GCP credentials.
