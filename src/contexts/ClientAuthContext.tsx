"use client";

import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { ChronixUser } from "@/types/roles";
import type { Client } from "@/types/crm";
import { onAuthChange, fetchUserProfile, signOutUser } from "@/lib/auth-service";
import { getClientByEmail } from "@/lib/client-portal-service";

interface ClientAuthState {
  firebaseUser:  User | null;
  profile:       ChronixUser | null;
  clientRecord:  Client | null;
  loading:       boolean;
  signOut:       () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthState | undefined>(undefined);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile]           = useState<ChronixUser | null>(null);
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const prof = await fetchUserProfile(user);
          setProfile(prof);
          if (prof.role === "Client") {
            const rec = await getClientByEmail(user.email ?? "");
            setClientRecord(rec);
          }
        } catch {
          setProfile(null);
          setClientRecord(null);
        }
      } else {
        setProfile(null);
        setClientRecord(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setProfile(null);
    setFirebaseUser(null);
    setClientRecord(null);
  }, []);

  return (
    <ClientAuthContext.Provider value={{ firebaseUser, profile, clientRecord, loading, signOut }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth(): ClientAuthState {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth must be used inside <ClientAuthProvider>");
  return ctx;
}
