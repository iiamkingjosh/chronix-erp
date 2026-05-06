import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import type { Role, ChronixUser } from "@/types/roles";

const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Secondary app — keeps auth and Firestore writes scoped to the new user,
// so the current admin session is never disturbed.
function getSecondaryApp() {
  const existing = getApps().find((a) => a.name === "setup");
  return existing ?? initializeApp(FIREBASE_CONFIG, "setup");
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  department?: string;
}

export async function createStaffUser(input: CreateUserInput): Promise<ChronixUser> {
  const app = getSecondaryApp();
  const auth = getAuth(app);
  const db = getFirestore(app); // Firestore tied to the secondary app's auth

  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  const { uid } = credential.user;

  const now = new Date().toISOString();
  const profile: ChronixUser = {
    uid,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    department: input.department,
    createdAt: now,
    lastLoginAt: now,
  };

  // The newly created user is authenticated in this app instance,
  // so Firestore rules (allow create: auth.uid == userId) will pass.
  await setDoc(doc(db, "users", uid), profile);

  await auth.signOut();
  return profile;
}
