"use client";
/**
 * Auth context – provides useAuth() hook throughout the app.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth as authApi, tokenStore } from "@/lib/api";

interface User {
  id: number;
  email: string;
  full_name: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.getAccess();
    if (token) {
      authApi.me()
        .then(setUser)
        .catch(() => tokenStore.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    const me = await authApi.me();
    setUser(me);
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const tokens = await authApi.register(email, password, fullName);
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    const me = await authApi.me();
    setUser(me);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
    window.location.href = "/auth/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
