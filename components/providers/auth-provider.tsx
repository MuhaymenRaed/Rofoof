"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type Role = "guest" | "customer" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  provinceCode: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  role: Role;
  isAdmin: boolean;
  /** true once the initial session has been resolved (avoids UI flicker) */
  ready: boolean;
  signOut: () => Promise<void>;
  /** re-read the profile (call after editing it) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Client auth state, backed by Supabase Auth. The browser client keeps the
 * session in cookies so Server Components can read it too. Security-sensitive
 * checks still happen on the server (see lib/auth/dal). This context only drives
 * client UI (header, account menu, favorites sync).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(
    async (id: string, email: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, phone, default_province_code")
        .eq("id", id)
        .maybeSingle();
      setUser({
        id,
        email,
        name: profile?.full_name || email.split("@")[0] || "",
        role: (profile?.role ?? "customer") as Role,
        phone: profile?.phone ?? null,
        provinceCode: profile?.default_province_code ?? null,
      });
      setReady(true);
    },
    [supabase],
  );

  const refresh = useCallback(async () => {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (u) await loadProfile(u.id, u.email ?? "");
  }, [supabase, loadProfile]);

  useEffect(() => {
    // onAuthStateChange emits INITIAL_SESSION immediately, covering first load.
    // The callback stays synchronous (defers the profile query) to avoid the
    // supabase-js "auth callback" lock.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (!u) {
        setUser(null);
        setReady(true);
        return;
      }
      void loadProfile(u.id, u.email ?? "");
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const value: AuthContextValue = {
    user,
    role: user?.role ?? "guest",
    isAdmin: user?.role === "admin",
    ready,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
