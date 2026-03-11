import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { User, AuthSession } from "../types/todo";
import { getAnySession, getUser } from "../lib/db";
import { logout as authLogout, refreshSession } from "../lib/authService";

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAuthData: (user: User, session: AuthSession) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const savedSession = await getAnySession();
        if (!savedSession) {
          setIsLoading(false);
          return;
        }
        const expiresAt = new Date(savedSession.expiresAt);
        if (expiresAt > new Date()) {
          const savedUser = await getUser(savedSession.userId);
          if (savedUser) {
            setUser(savedUser);
            setSession(savedSession);
          }
          setIsLoading(false);
          return;
        }
        // Access token expired: try to refresh using refresh token (valid 7 days)
        const refreshed = await refreshSession();
        if (refreshed) {
          setUser(refreshed.user);
          setSession(refreshed.session);
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
  }, []);

  const setAuthData = useCallback((newUser: User, newSession: AuthSession) => {
    setUser(newUser);
    setSession(newSession);
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await authLogout(user.id);
    }
    setUser(null);
    setSession(null);
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
