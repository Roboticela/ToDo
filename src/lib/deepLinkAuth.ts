import { saveUser, saveSession } from "./db";
import { getApiBase } from "./apiBase";
import type { User, AuthSession } from "../types/todo";

/**
 * Exchange one-time code for tokens via backend, then save session and set auth.
 * Used by the app after polling GET desktop-pending (desktop flow).
 */
export async function completeDesktopAuthWithCode(
  code: string,
  setAuthData: (user: User, session: AuthSession) => void
): Promise<boolean> {
  const apiBase = getApiBase();
  if (!apiBase) {
    console.error("[deepLink] getApiBase() is empty – set VITE_API_URL (e.g. in .env)");
    return false;
  }
  const exchangeRes = await fetch(`${apiBase}/api/auth/desktop-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({}));
    console.warn("[deepLink] desktop-exchange failed", exchangeRes.status, err);
    return false;
  }
  const { accessToken, refreshToken, userId } = await exchangeRes.json();
  if (!accessToken || !userId) return false;

  const meRes = await fetch(`${apiBase}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return false;
  const userData = await meRes.json();
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
  const session: AuthSession = {
    accessToken,
    refreshToken: refreshToken || "",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    userId,
  };
  await saveUser(user);
  await saveSession(session);
  setAuthData(user, session);
  return true;
}
