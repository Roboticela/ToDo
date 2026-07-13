// @refresh reset
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { User, AuthSession } from "../types/todo";
import { getAnySession, getUser, saveSession, saveUser } from "../lib/db";
import { logout as authLogout, refreshSession } from "../lib/authService";
import { getApiBase } from "../lib/apiBase";
import { mapUserFromApi } from "../lib/mapUserFromApi";
import { X } from "lucide-react";

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
  // BUG-37: Non-blocking session expiry notice instead of alert()
  const [sessionExpired, setSessionExpired] = useState(false);
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
    // Do not hand out an already-expired access token
    if (expiresAt <= Date.now()) return null;
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
          // Refresh profile from server so plan / hasPassword aren't stale
          if (!savedSession.accessToken.startsWith("local_")) {
            try {
              const res = await fetch(`${getApiBase()}/api/users/me`, {
                headers: { Authorization: `Bearer ${savedSession.accessToken}` },
              });
              if (res.ok) {
                const userData = await res.json();
                const updatedUser = mapUserFromApi(userData);
                await saveUser(updatedUser);
                applySession(updatedUser, savedSession);
              } else if (res.status === 401) {
                // Access token rejected — try refresh once, else clear session
                const refreshed = await refreshSession();
                if (refreshed) {
                  applySession(refreshed.user, refreshed.session);
                } else {
                  await authLogout(savedSession.userId);
                  setUser(null);
                  setSession(null);
                  sessionRef.current = null;
                }
              }
              // Non-401 errors (network/5xx): keep cached user
            } catch {
              // keep cached user on network failure
            }
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
  // BUG-37: Use non-blocking state toast; alert() can freeze the Android WebView thread
  // BUG-30: Only force-logout on explicit auth failure, NOT on network errors
  useEffect(() => {
    if (!session || session.accessToken.startsWith("local_")) return;
    const id = window.setInterval(async () => {
      if (!navigator.onLine) return; // Don't touch session while offline
      try {
        // refreshSession returns null only on a clear 401; network errors throw/return null too.
        // We distinguish by checking expiry: if token is still valid locally, keep it.
        const current = sessionRef.current;
        const expiresAt = current ? new Date(current.expiresAt).getTime() : 0;
        const stillValid = expiresAt - Date.now() > 0;
        const refreshed = await refreshSession();
        if (refreshed) {
          // Good — token renewed
          return;
        }
        // refreshSession returned null. Only log out if the token is truly expired
        // AND we are online (network error would also return null but token may be fine).
        if (!stillValid && navigator.onLine) {
          await authLogout(session.userId);
          setUser(null);
          setSession(null);
          sessionRef.current = null;
          setSessionExpired(true);
        }
        // If stillValid but refresh failed → network error → keep session, retry next tick
      } catch {
        // Network error — do nothing, try again next interval
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [session]);

  // Refetch profile (plan, etc.) when window regains focus — picks up Paddle webhooks
  useEffect(() => {
    if (!session || session.accessToken.startsWith("local_")) return;

    async function refetchProfile() {
      try {
        const fresh = await ensureFreshSession();
        if (!fresh?.accessToken || fresh.accessToken.startsWith("local_")) return;
        const res = await fetch(`${getApiBase()}/api/users/me`, {
          headers: { Authorization: `Bearer ${fresh.accessToken}` },
        });
        if (res.status === 401) {
          const refreshed = await refreshSession();
          if (!refreshed) {
            await authLogout(fresh.userId);
            setUser(null);
            setSession(null);
            sessionRef.current = null;
            return;
          }
          applySession(refreshed.user, refreshed.session);
          const retry = await fetch(`${getApiBase()}/api/users/me`, {
            headers: { Authorization: `Bearer ${refreshed.session.accessToken}` },
          });
          if (!retry.ok) {
            if (retry.status === 401) {
              await authLogout(refreshed.session.userId);
              setUser(null);
              setSession(null);
              sessionRef.current = null;
            }
            return;
          }
          const userData = await retry.json();
          const updatedUser = mapUserFromApi(userData);
          await saveUser(updatedUser);
          setUser(updatedUser);
          return;
        }
        if (!res.ok) return;
        const userData = await res.json();
        const updatedUser = mapUserFromApi(userData);
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
  }, [session, ensureFreshSession, applySession]);

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
      {/* BUG-37: Non-blocking session expiry banner instead of blocking alert() */}
      {sessionExpired && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/95 text-white text-sm font-medium shadow-xl backdrop-blur-sm"
        >
          <span>Your session has expired. Please log in again.</span>
          <button
            type="button"
            onClick={() => setSessionExpired(false)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
