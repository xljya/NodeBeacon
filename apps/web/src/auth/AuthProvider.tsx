import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { AuthResponse, AuthChallengeResponse, AuthSessionResponse, AuthUser, SecondFactorRequiredResponse } from "@nodebeacon/shared";
import { apiGet, apiPost, ApiError } from "../lib/api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<"authenticated" | "second_factor_required">;
  secondFactor: (code: string) => Promise<void>;
  challengeRequired: () => Promise<boolean>;
  cancelSecondFactor: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = authGeneration.current;
    try {
      const data = await apiGet<AuthSessionResponse>("/api/auth/session");
      if (generation === authGeneration.current) setUser(data.user);
    } catch {
      if (generation === authGeneration.current) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    authGeneration.current += 1;
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (res.status === 202) {
      const data = await res.json() as SecondFactorRequiredResponse;
      if (data.status === "second_factor_required") return "second_factor_required" as const;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      throw new ApiError(body?.error?.message ?? "Sign-in failed", res.status, body?.error?.code);
    }
    const data = await res.json() as AuthResponse;
    setUser(data.user);
    return "authenticated" as const;
  }, []);

  const secondFactor = useCallback(async (code: string) => {
    const data = await apiPost<AuthResponse>("/api/auth/2fa", { code });
    setUser(data.user);
  }, []);

  const challengeRequired = useCallback(async () => {
    const data = await apiGet<AuthChallengeResponse>("/api/auth/challenge");
    return data.required;
  }, []);

  const cancelSecondFactor = useCallback(async () => {
    await apiPost("/api/auth/2fa/cancel");
  }, []);

  const logout = useCallback(async () => {
    authGeneration.current += 1;
    try {
      await apiPost("/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, secondFactor, challengeRequired, cancelSecondFactor, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
