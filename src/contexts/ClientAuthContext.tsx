"use client";

import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { ChronixUser } from "@/types/roles";
import type { Client } from "@/types/crm";
import { onAuthChange, signOutUser } from "@/lib/auth-service";
import { loadClientPortalState, type ClientPortalErrorKind } from "@/lib/client-portal-service";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { markLoggedOutForInactivity } from "@/lib/inactivity";
import InactivityWarningModal from "@/components/InactivityWarningModal";

interface ClientAuthState {
  firebaseUser:  User | null;
  profile:       ChronixUser | null;
  clientRecord:  Client | null;
  loading:       boolean;
  errorKind:     ClientPortalErrorKind;
  reload:        () => Promise<void>;
  signOut:       () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthState | undefined>(undefined);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile]           = useState<ChronixUser | null>(null);
  const [clientRecord, setClientRecord] = useState<Client | null>(null);
  const [loading, setLoading]           = useState(true);
  const [errorKind, setErrorKind]       = useState<ClientPortalErrorKind>("none");
  const userRef = useRef<User | null>(null);

  const load = useCallback(async (user: User) => {
    const state = await loadClientPortalState(user);
    setProfile(state.profile);
    setClientRecord(state.clientRecord);
    setErrorKind(state.errorKind);
  }, []);

  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      userRef.current = user;
      if (user) {
        await load(user);
      } else {
        setProfile(null);
        setClientRecord(null);
        setErrorKind("none");
      }
      setLoading(false);
    });
    return unsub;
  }, [load]);

  const reload = useCallback(async () => {
    if (!userRef.current) return;
    setLoading(true);
    await load(userRef.current);
    setLoading(false);
  }, [load]);

  const signOut = useCallback(async () => {
    await signOutUser();
    setProfile(null);
    setFirebaseUser(null);
    setClientRecord(null);
    setErrorKind("none");
  }, []);

  const handleInactivityLogout = useCallback(() => {
    markLoggedOutForInactivity();
    signOut();
  }, [signOut]);

  const { showWarning, stayLoggedIn } = useInactivityLogout(!!profile, handleInactivityLogout);

  return (
    <ClientAuthContext.Provider value={{ firebaseUser, profile, clientRecord, loading, errorKind, reload, signOut }}>
      {children}
      {showWarning && <InactivityWarningModal onStayLoggedIn={stayLoggedIn} />}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth(): ClientAuthState {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth must be used inside <ClientAuthProvider>");
  return ctx;
}
