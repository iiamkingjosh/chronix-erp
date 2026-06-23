import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { connectFirestoreEmulator } from "firebase/firestore";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import type { Role } from "@/types/roles";

const PROJECT_ID = "demo-chronix-test";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const AUTH_HOST = "127.0.0.1";
const AUTH_PORT = 9099;

let connected = false;
let testEnv: RulesTestEnvironment | null = null;
let userCounter = 0;

/**
 * Connects the app's real singleton db/auth (the same instances every
 * service-layer function under test imports, using the MODULAR firebase/*
 * SDK) to the local emulators, and boots a RulesTestEnvironment purely for
 * rules-bypassing fixture seeding/inspection and clearFirestore() between
 * tests.
 *
 * IMPORTANT: `RulesTestContext.firestore()` in @firebase/rules-unit-testing
 * v3.x returns a *compat* (namespaced) Firestore instance, not a modular
 * one — it is NOT interchangeable with `doc()`/`getDoc()`/`setDoc()` from
 * `firebase/firestore`. All admin/seed helpers below therefore use the
 * compat API (`.collection(x).doc(y).get()/.set()`) explicitly.
 *
 * ALSO IMPORTANT: `withSecurityRulesDisabled(callback)` resolves to
 * `Promise<void>` and discards whatever the callback returns (confirmed by
 * reading the package's own implementation) — so admin helpers below must
 * capture results via an outer-scoped variable, not a callback return value.
 */
export async function connectEmulators(): Promise<void> {
  if (connected) return;
  connected = true;

  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
  connectAuthEmulator(auth, `http://${AUTH_HOST}:${AUTH_PORT}`, { disableWarnings: true });

  const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
    },
  });
}

export async function clearAll(): Promise<void> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  await testEnv.clearFirestore();
}

export async function teardownEmulators(): Promise<void> {
  if (testEnv) await testEnv.cleanup();
}

/** Writes a users/{uid} profile doc bypassing firestore.rules — fixture setup only. */
export async function seedUserRole(
  uid: string,
  role: Role,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore(); // compat API
    await adminDb.collection("users").doc(uid).set({
      uid,
      email: extra.email ?? `${uid}@test.local`,
      displayName: extra.displayName ?? uid,
      role,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      ...extra,
    });
  });
}

/**
 * Writes an arbitrary document bypassing rules — for seeding fixtures
 * that a test then mutates through the real, rules-enforced service-layer
 * function under test.
 */
export async function seedDoc(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb.collection(collectionPath).doc(id).set(data);
  });
}

/** Reads a document bypassing rules — for assertions, so a denied read doesn't mask the real assertion. */
export async function readDocAsAdmin<T = Record<string, unknown>>(
  collectionPath: string,
  id: string
): Promise<T | null> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  let result: T | null = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    const snap = await adminDb.collection(collectionPath).doc(id).get();
    result = snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
  });
  return result;
}

/** Deletes a document bypassing rules — for simulating races/cleanup in fixtures, not for testing app delete logic. */
export async function deleteDocAsAdmin(collectionPath: string, id: string): Promise<void> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb.collection(collectionPath).doc(id).delete();
  });
}

export async function queryAsAdmin<T = Record<string, unknown>>(
  collectionPath: string,
  whereField: string,
  whereValue: unknown
): Promise<T[]> {
  if (!testEnv) throw new Error("connectEmulators() must run first");
  let result: T[] = [];
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    const snap = await adminDb.collection(collectionPath).where(whereField, "==", whereValue).get();
    result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
  });
  return result;
}

/**
 * Creates a real Firebase Auth Emulator user, seeds their Firestore role
 * profile (bypassing rules), and leaves them signed in on the app's real
 * `auth` singleton — so every subsequent call through the unmodified
 * service-layer functions (which import `db`/`auth` directly) runs as this
 * authenticated, role-bearing user, with firestore.rules genuinely enforced.
 */
export async function signInAs(role: Role): Promise<{ uid: string; email: string }> {
  await connectEmulators();
  userCounter += 1;
  const email = `test-user-${userCounter}-${Date.now()}@test.local`;
  const password = "test-password-123";
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await seedUserRole(uid, role, { email });
  return { uid, email };
}

export async function signInExisting(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, "test-password-123");
}

export async function signOutCurrent(): Promise<void> {
  await signOut(auth);
}
