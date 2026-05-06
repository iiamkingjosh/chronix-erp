"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { ChronixUser } from "@/types/roles";
import { onAuthChange, fetchUserProfile, signOutUser } from "@/lib/auth-service";

interface AuthState {
  firebaseUser:  User | null;
  profile:       ChronixUser | null;
  loading:       boolean;
  profileError:  string | null;   // Firestore fetch failure message
  signOut:       () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser]   = useState<User | null>(null);
  const [profile, setProfile]             = useState<ChronixUser | null>(null);
  const [loading, setLoading]             = useState(true);   // true = auth not yet resolved
  const [profileError, setProfileError]   = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      setProfileError(null);

      if (user) {
        try {
          const prof = await fetchUserProfile(user);
          setProfile(prof);
        } catch (err) {
          /* Firestore unreachable or rules blocking — keep firebaseUser
             set so we can show an error rather than silently redirecting
             to /login.                                                    */
          setProfile(null);
          setProfileError(
            err instanceof Error ? err.message : "Could not load user profile."
          );
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setProfile(null);
    setFirebaseUser(null);
    setProfileError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, profileError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
