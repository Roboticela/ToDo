import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { saveUser } from "../../lib/db";
import type { User } from "../../types/todo";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Landed after clicking the email verification link.
 * If the user is already logged in, refresh their profile (so emailVerifiedAt updates) and go to /todo.
 * Otherwise redirect to login with ?verified=1.
 */
export default function VerifiedPage() {
  const navigate = useNavigate();
  const { session, updateUser, isAuthenticated, isLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "updated" | "redirect">("loading");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !session) {
      navigate("/auth/login?verified=1", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/me`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!res.ok || cancelled) {
          if (!cancelled) navigate("/auth/login?verified=1", { replace: true });
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
          subscribedToReminders: userData.subscribedToReminders ?? true,
          createdAt: userData.createdAt,
        };
        await saveUser(user);
        updateUser(user);
        if (!cancelled) {
          setStatus("updated");
          navigate("/todo", { replace: true });
        }
      } catch {
        if (!cancelled) navigate("/auth/login?verified=1", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, session, navigate, updateUser]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-foreground/60">
          {status === "loading" ? "Verification confirmed. Updating your account…" : "Taking you to the app…"}
        </p>
      </div>
    </div>
  );
}
