import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { ChronixUser, Role } from "@/types/roles";
import { resolveRole, ROLES } from "@/types/roles";
import { logAuditEvent } from "./audit-service";

/* ── Cookie helpers ───────────────────────────────────────── */

function setSessionCookie(token: string) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `__session=${token}; path=/; expires=${expires}; SameSite=Strict`;
}

function clearSessionCookie() {
  document.cookie = "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
}

/* ── fetchUserProfile ─────────────────────────────────────
   Read-only lookup of the users/{uid} document.  Signing in
   must never create an account — only signUp() (the explicit
   "Create account" action) or an admin-provisioning route may
   create a profile.  If no profile exists (e.g. a Firebase Auth
   account was created outside the app, or an admin deleted the
   profile), this throws so the caller is forced to register or
   contact an administrator instead of being silently logged in.
   ─────────────────────────────────────────────────────────── */
export async function fetchUserProfile(user: User): Promise<ChronixUser> {
  const ref  = doc(db, "users", user.uid);
  let snap = await getDoc(ref);

  // Bridges a real race: signUp()'s createUserWithEmailAndPassword() fires
  // every onAuthStateChanged listener app-wide (including AuthContext's,
  // which calls this function) the instant it resolves — independent of,
  // and not awaited by, signUp()'s own subsequent setDoc() call. signUp()
  // also awaits updateProfile() before it even builds the profile object,
  // adding latency that tilts this race toward the read losing more often
  // than not. A few short retries bridges that window. Applies to every
  // caller (signIn() included) rather than only the post-signup path —
  // deliberate: a genuinely-missing profile is rare, and ~1.2s of added
  // latency on that rare path is the right tradeoff for closing this race
  // everywhere it can occur, not just where it was first observed.
  for (let attempt = 0; !snap.exists() && attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    snap = await getDoc(ref);
  }

  if (!snap.exists()) {
    throw new Error("No account found for this login. Please create an account or contact an administrator.");
  }

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

/**
 * Public self-registration (Firebase Auth + Firestore Staff bootstrap).
 * Disabled in UI when NEXT_PUBLIC_ENABLE_SELF_SIGNUP=false.
 * This is the only sign-up path that may create a new profile —
 * signIn()/fetchUserProfile() are read-only.
 */
export async function signUp(email: string, password: string, displayName: string): Promise<ChronixUser> {
  const trimmedEmail = email.trim();
  const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  const dn = displayName.trim();
  if (dn) await updateProfile(credential.user, { displayName: dn }).catch(() => {});

  const now = new Date().toISOString();
  const profile: ChronixUser = {
    uid:         credential.user.uid,
    email:       trimmedEmail,
    displayName: dn || trimmedEmail.split("@")[0],
    role:        ROLES.STAFF,
    createdAt:   now,
    lastLoginAt: now,
  };
  await setDoc(doc(db, "users", credential.user.uid), profile);

  const token = await credential.user.getIdToken();
  setSessionCookie(token);
  logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "users", entityId: profile.uid, entityRef: profile.email, details: "New account registered", timestamp: now });
  return profile;
}

/* ── signIn ───────────────────────────────────────────────── */

export async function signIn(email: string, password: string): Promise<ChronixUser> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  let profile: ChronixUser;
  try {
    profile = await fetchUserProfile(credential.user);
  } catch (err) {
    /* Auth succeeded but no profile exists — don't leave a dangling
       authenticated session with nothing to show for it. */
    await signOut(auth).catch(() => {});
    throw err;
  }

  /* Session cookie lets the Next.js proxy know the user is authed */
  const token = await credential.user.getIdToken();
  setSessionCookie(token);

  /* Update lastLoginAt (non-blocking) */
  setDoc(doc(db, "users", credential.user.uid), { lastLoginAt: new Date().toISOString() }, { merge: true })
    .catch(() => { /* best-effort */ });

  logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "login", module: "users", entityId: profile.uid, entityRef: profile.email, details: "User signed in", timestamp: new Date().toISOString() });
  return profile;
}

/* ── signOutUser ──────────────────────────────────────────── */

export async function signOutUser(): Promise<void> {
  clearSessionCookie();
  await signOut(auth);
}

/* ── sendReset ────────────────────────────────────────────── */
/** Routes through /api/auth/send-password-reset (Admin SDK link + Resend)
 * instead of Firebase Auth's own default mail relay: Firebase's default
 * sender has no custom-domain reputation and is commonly spam-filtered,
 * while Resend's chronixtechnology.com is verified and already used for
 * every other transactional email in this app. */
export async function sendReset(email: string): Promise<void> {
  const res = await fetch("/api/auth/send-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not send reset email");
  }
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
