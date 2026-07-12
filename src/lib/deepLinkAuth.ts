import { saveUser, saveSession } from "./db";
import { getApiBase } from "./apiBase";
import { clearLocalAuthState, isValidAuthPayload } from "./authService";
import { mapUserFromApi } from "./mapUserFromApi";
import type { User, AuthSession } from "../types/todo";

/**
 * Exchange one-time code for tokens via backend, then save session and set auth.
 * Used by the app after polling GET desktop-pending (desktop flow).
 * Returns the mapped user on success, or null on failure.
 */
export async function completeDesktopAuthWithCode(
  code: string,
  setAuthData: (user: User, session: AuthSession) => void
): Promise<User | null> {
  const apiBase = getApiBase();
  if (!apiBase) {
    console.error("[deepLink] getApiBase() is empty – set VITE_API_URL (e.g. in .env)");
    return null;
  }
  const exchangeRes = await fetch(`${apiBase}/api/auth/desktop-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({}));
    console.warn("[deepLink] desktop-exchange failed", exchangeRes.status, err);
    return null;
  }
  const data = await exchangeRes.json();
  // Prefer full session payload from server; fall back to flat token fields
  if (isValidAuthPayload(data)) {
    await clearLocalAuthState();
    const user = mapUserFromApi(data.user as unknown as Record<string, unknown>);
    await saveUser(user);
    await saveSession(data.session);
    setAuthData(user, data.session);
    return user;
  }

  const { accessToken, refreshToken, userId } = data;
  if (!accessToken || !userId) return null;

  const meRes = await fetch(`${apiBase}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return null;
  const userData = await meRes.json();
  if (!userData?.id) return null;
  const me = mapUserFromApi(userData);
  const session: AuthSession = {
    accessToken,
    refreshToken: refreshToken || "",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    userId,
  };
  await clearLocalAuthState();
  await saveUser(me);
  await saveSession(session);
  setAuthData(me, session);
  return me;
}
