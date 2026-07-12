import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { saveUser, saveSession } from "../../lib/db";
import { getApiBase } from "../../lib/apiBase";
import type { User, AuthSession } from "../../types/todo";

/**
 * Handles OAuth callback from backend redirect.
 * Web uses a one-time `code` query param (exchanged via API — tokens never appear in the URL).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthData } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      exchangeCode(code);
      return;
    }

    const err = searchParams.get("error");
    if (err) {
      setError(err === "missing_code" ? "Sign-in was cancelled or failed." : String(err));
      return;
    }

    setError("No session data received.");
  }, [searchParams]);

  async function exchangeCode(code: string) {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/desktop-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        setError("Sign-in expired. Please try again.");
        return;
      }
      const data = await res.json();
      const user = data.user as User;
      const session = data.session as AuthSession;
      await saveUser(user);
      await saveSession(session);
      setAuthData(user, session);
      window.history.replaceState({}, "", "/auth/callback");
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
