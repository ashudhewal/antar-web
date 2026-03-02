"use client";

import { getFirebaseAuth } from "@/lib/firebase";
import { AuthSession } from "@/lib/types";
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface AuthContextValue {
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const provider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configuredAuth = getFirebaseAuth();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(() => !configuredAuth);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return () => undefined;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session: user
      ? {
          uid: user.uid,
          name: user.displayName,
          email: user.email
        }
      : null,
    loading: !authReady,
    signInWithGoogle: async () => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase web auth is not configured.");
      try {
        await signInWithPopup(auth, provider);
      } catch {
        await signInWithRedirect(auth, provider);
      }
    },
    logout: async () => {
      const auth = getFirebaseAuth();
      if (!auth) return;
      await signOut(auth);
    }
  }), [authReady, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
