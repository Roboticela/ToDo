import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { User, AuthSession } from "../types/todo";
import { getAnySession, getUser, saveSession, saveUser } from "../lib/db";
import { logout as authLogout, refreshSession } from "../lib/authService";
import { getApiBase } from "../lib/apiBase";

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuthData: (user: User, session: AuthSession) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  /** Refresh tokens if access token is expired or about to expire. Returns latest session or null. */
  ensureFreshSession: () => Promise<AuthSession | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REFRESH_SKEW_MS = 60 * 1000; // refresh 1 min before expiry

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionRef = useRef<AuthSession | null>(null);
  sessionRef.current = session;

  const applySession = useCallback((u: User, s: AuthSession) => {
    setUser(u);
    setSession(s);
    sessionRef.current = s;
  }, []);

  const ensureFreshSession = useCallback(async (): Promise<AuthSession | null> => {
    const current = sessionRef.current || (await getAnySession());
    if (!current) return null;
    if (current.accessToken.startsWith("local_")) return current;

    const expiresAt = new Date(current.expiresAt).getTime();
    if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
      return current;
    }

    const refreshed = await refreshSession();
    if (refreshed) {
      applySession(refreshed.user, refreshed.session);
      return refreshed.session;
    }
    return current;
  }, [applySession]);

  useEffect(() => {
    async function restoreSession() {
      try {
        const savedSession = await getAnySession();
        if (!savedSession) {
          setIsLoading(false);
          return;
        }
        const expiresAt = new Date(savedSession.expiresAt);
        if (expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
          const savedUser = await getUser(savedSession.userId);
          if (savedUser) {
            applySession(savedUser, savedSession);
          }
          setIsLoading(false);
          return;
        }
        const refreshed = await refreshSession();
        if (refreshed) {
          applySession(refreshed.user, refreshed.session);
        } else if (expiresAt > new Date()) {
          const savedUser = await getUser(savedSession.userId);
          if (savedUser) applySession(savedUser, savedSession);
        } else {
          await authLogout(savedSession.userId);
        }
      } catch {
        // ignore restore errors
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, [applySession]);

  // Proactive refresh while the app is open
  useEffect(() => {
    if (!session || session.accessToken.startsWith("local_")) return;
    const id = window.setInterval(() => {
      ensureFreshSession().catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [session, ensureFreshSession]);

  // Refetch profile (plan, etc.) when window regains focus — picks up Paddle webhooks
  useEffect(() => {
    if (!session || session.accessToken.startsWith("local_")) return;

    async function refetchProfile() {
      const current = sessionRef.current;
      if (!current?.accessToken || current.accessToken.startsWith("local_")) return;
      try {
        const res = await fetch(`${getApiBase()}/api/users/me`, {
          headers: { Authorization: `Bearer ${current.accessToken}` },
        });
        if (!res.ok) return;
        const userData = await res.json();
        const updatedUser: User = {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          avatarUrl: userData.avatarUrl,
          plan: userData.plan,
          planExpiresAt: userData.planExpiresAt,
          emailVerifiedAt: userData.emailVerifiedAt,
          subscribedToReminders: userData.subscribedToReminders ?? true,
          hasPassword: userData.hasPassword,
          createdAt: userData.createdAt,
        };
        await saveUser(updatedUser);
        setUser(updatedUser);
      } catch {
        // ignore
      }
    }

    const onFocus = () => {
      void refetchProfile();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void refetchProfile();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session]);

  const setAuthData = useCallback(
    (newUser: User, newSession: AuthSession) => {
      applySession(newUser, newSession);
      void saveUser(newUser);
      void saveSession(newSession);
    },
    [applySession]
  );

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await authLogout(user.id);
    }
    setUser(null);
    setSession(null);
    sessionRef.current = null;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user && !!session,
        setAuthData,
        updateUser,
        logout,
        ensureFreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
