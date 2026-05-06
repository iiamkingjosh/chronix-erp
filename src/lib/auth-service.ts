import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { ChronixUser, Role } from "@/types/roles";
import { resolveRole, ROLES } from "@/types/roles";

/* ── Cookie helpers ───────────────────────────────────────── */

function setSessionCookie(token: string) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `__session=${token}; path=/; expires=${expires}; SameSite=Strict`;
}

function clearSessionCookie() {
  document.cookie = "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
}

/* ── fetchUserProfile ─────────────────────────────────────
   Reads the users/{uid} document from Firestore.
   If the document does not yet exist (e.g. Firebase Auth user
   was created directly in the console without a matching
   Firestore profile), a minimal "Staff" profile is created
   automatically so the user can still log in.  An admin can
   later update the role via Firestore Console or /setup/create-user.
   ─────────────────────────────────────────────────────────── */
export async function fetchUserProfile(user: User): Promise<ChronixUser> {
  const ref  = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    /* Normalise: ensure uid is always correct and role is canonical */
    const profile: ChronixUser = {
      uid:         user.uid,
      email:       data.email       ?? user.email ?? "",
      displayName: data.displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "User",
      role:        resolveRole(data.role ?? "") as Role,
      department:  data.department,
      photoURL:    data.photoURL ?? user.photoURL,
      createdAt:   data.createdAt   ?? new Date().toISOString(),
      lastLoginAt: data.lastLoginAt ?? new Date().toISOString(),
    };
    return profile;
  }

  /* No profile document — create a baseline one so login succeeds.
     The role defaults to "Staff"; update it in Firestore to promote
     the user.                                                       */
  const now = new Date().toISOString();
  const profile: ChronixUser = {
    uid:         user.uid,
    email:       user.email ?? "",
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "User",
    role:        ROLES.STAFF,
    createdAt:   now,
    lastLoginAt: now,
  };
  await setDoc(ref, profile);
  return profile;
}

/* ── signIn ───────────────────────────────────────────────── */

export async function signIn(email: string, password: string): Promise<ChronixUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile    = await fetchUserProfile(credential.user);

  /* Session cookie lets the Next.js proxy know the user is authed */
  const token = await credential.user.getIdToken();
  setSessionCookie(token);

  /* Update lastLoginAt (non-blocking) */
  setDoc(doc(db, "users", credential.user.uid), { lastLoginAt: new Date().toISOString() }, { merge: true })
    .catch(() => { /* best-effort */ });

  return profile;
}

/* ── signOutUser ──────────────────────────────────────────── */

export async function signOutUser(): Promise<void> {
  clearSessionCookie();
  await signOut(auth);
}

/* ── sendReset ────────────────────────────────────────────── */

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/* ── onAuthChange ─────────────────────────────────────────── */

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/* ── createUserProfile ────────────────────────────────────── */
/** Called by an admin to bootstrap a new staff member in Firestore */
export async function createUserProfile(
  uid: string,
  email: string,
  displayName: string,
  role: Role
): Promise<void> {
  await setDoc(doc(db, "users", uid), {
    uid,
    email,
    displayName,
    role,
    createdAt:   new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  } satisfies ChronixUser);
}
