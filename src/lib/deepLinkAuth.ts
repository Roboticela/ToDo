import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { saveUser, saveSession } from "./db";
import type { User, AuthSession } from "../types/todo";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function parseAuthUrl(url: string): { accessToken: string; refreshToken: string; userId: string } | null {
  try {
    if (!url.startsWith("roboticela-todo://auth")) return null;
    const u = new URL(url);
    const accessToken = u.searchParams.get("accessToken");
    const userId = u.searchParams.get("userId");
    if (!accessToken || !userId) return null;
    return {
      accessToken,
      refreshToken: u.searchParams.get("refreshToken") || "",
      userId,
    };
  } catch {
    return null;
  }
}

export async function handleAuthDeepLink(
  url: string,
  setAuthData: (user: User, session: AuthSession) => void
): Promise<boolean> {
  const parsed = parseAuthUrl(url);
  if (!parsed) return false;

  try {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      headers: { Authorization: `Bearer ${parsed.accessToken}` },
    });
    if (!res.ok) return false;
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
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      userId: parsed.userId,
    };
    await saveUser(user);
    await saveSession(session);
    setAuthData(user, session);
    return true;
  } catch {
    return false;
  }
}

export function setupDeepLinkAuth(setAuthData: (user: User, session: AuthSession) => void): () => void {
  getCurrent().then((urls) => {
    if (!urls || urls.length === 0) return;
    const authUrl = urls.find((u) => u.startsWith("roboticela-todo://auth"));
    if (authUrl) handleAuthDeepLink(authUrl, setAuthData);
  });

  const unlisten = onOpenUrl((urls) => {
    const authUrl = urls.find((u) => u.startsWith("roboticela-todo://auth"));
    if (authUrl) {
      handleAuthDeepLink(authUrl, setAuthData).then((handled) => {
        if (handled) window.location.href = "/todo";
      });
    }
  });

  return () => {
    if (typeof unlisten?.then === "function") unlisten.then((fn) => fn());
  };
}
