import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiHttpError, clearToken, getToken, setToken } from "./api";
import type { StaffUser } from "./types";

interface LoginResponse {
  token: string;
  user: StaffUser;
}

interface AuthState {
  user: StaffUser | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus("anonymous");
      return;
    }
    let cancelled = false;
    apiFetch<StaffUser>("/api/auth/me")
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        clearToken();
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    try {
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(result.token);
      setUser(result.user);
      setStatus("authenticated");
    } catch (err) {
      if (err instanceof ApiHttpError) throw err;
      throw new Error("Đăng nhập thất bại");
    }
  }

  function logout() {
    clearToken();
    setUser(null);
    setStatus("anonymous");
  }

  return (
    <AuthCtx.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
