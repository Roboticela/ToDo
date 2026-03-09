import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { saveUser, saveSession } from "../../lib/db";
import type { User, AuthSession } from "../../types/todo";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Handles OAuth callback from backend redirect.
 * - Web: URL hash contains base64url-encoded session (accessToken, refreshToken, expiresAt, userId).
 * - We decode, fetch user if needed, save to IDB and set auth context, then redirect to /todo.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthData } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const tokenFromQuery = searchParams.get("token");
    const refreshFromQuery = searchParams.get("refresh");
    const userIdFromQuery = searchParams.get("userId");

    if (hash) {
      // Web redirect: session in hash (base64 JSON)
      try {
        const decoded = JSON.parse(atob(hash));
        const { accessToken, refreshToken, expiresAt, userId } = decoded;
        if (!accessToken || !userId) {
          setError("Invalid callback data");
          return;
        }
        finishLogin(accessToken, refreshToken, expiresAt, userId);
        return;
      } catch {
        setError("Invalid callback data");
        return;
      }
    }

    if (tokenFromQuery && userIdFromQuery) {
      // Desktop success page: token in query (and optionally refresh)
      finishLogin(
        tokenFromQuery,
        refreshFromQuery || "",
        new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        userIdFromQuery
      );
      return;
    }

    const err = searchParams.get("error");
    if (err) {
      setError(err === "missing_code" ? "Sign-in was cancelled or failed." : String(err));
      return;
    }

    setError("No session data received.");
  }, [searchParams]);

  async function finishLogin(
    accessToken: string,
    refreshToken: string,
    expiresAt: string,
    userId: string
  ) {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        setError("Failed to load user");
        return;
      }
      const userData = await res.json();
      const user: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
        plan: userData.plan,
        planExpiresAt: userData.planExpiresAt,
        emailVerifiedAt: userData.emailVerifiedAt,
        createdAt: userData.createdAt,
      };
      const session: AuthSession = {
        accessToken,
        refreshToken,
        expiresAt,
        userId,
      };
      await saveUser(user);
      await saveSession(session);
      setAuthData(user, session);
      window.location.replace("/todo");
    } catch {
      setError("Something went wrong");
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="text-primary hover:underline"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-foreground/60">Completing sign-in...</p>
      </div>
    </div>
  );
}
