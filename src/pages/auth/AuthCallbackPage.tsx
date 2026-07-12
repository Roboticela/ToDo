import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { saveUser, saveSession } from "../../lib/db";
import { clearLocalAuthState, isValidAuthPayload } from "../../lib/authService";
import { getApiBase } from "../../lib/apiBase";

/** Prevent StrictMode double-mount from consuming a one-time code twice */
const exchangedCodes = new Set<string>();

function readOAuthCode(searchParams: URLSearchParams): string | null {
  // Prefer hash (not sent in Referer); fall back to query for older redirects
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash) {
    const fromHash = new URLSearchParams(hash).get("code");
    if (fromHash) return fromHash;
  }
  return searchParams.get("code");
}

/**
 * Handles OAuth callback from backend redirect.
 * Web uses a one-time `code` in the URL hash (exchanged via API — tokens never appear).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthData } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const code = readOAuthCode(searchParams);
    if (code) {
      if (exchangedCodes.has(code) || startedRef.current) return;
      startedRef.current = true;
      exchangedCodes.add(code);
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
        exchangedCodes.delete(code);
        startedRef.current = false;
        setError("Sign-in expired. Please try again.");
        return;
      }
      const data = await res.json();
      if (!isValidAuthPayload(data)) {
        exchangedCodes.delete(code);
        startedRef.current = false;
        setError("Invalid sign-in response. Please try again.");
        return;
      }
      await clearLocalAuthState();
      await saveUser(data.user);
      await saveSession(data.session);
      setAuthData(data.user, data.session);
      window.history.replaceState({}, "", "/auth/callback");
      window.location.replace("/todo");
    } catch {
      exchangedCodes.delete(code);
      startedRef.current = false;
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
