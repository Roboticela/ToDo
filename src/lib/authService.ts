import type { User, AuthSession } from "../types/todo";
import { saveUser, getUser, saveSession, getAnySession, deleteSession } from "./db";
import { v4 as uuidv4 } from "./uuid";
import { isTauri } from "./tauri";
import { getApiBase } from "./apiBase";

const API_BASE = getApiBase();

// ─── Local Demo Auth (offline fallback) ───────────────────────────────────────

function createLocalUser(name: string, email: string): User {
  return {
    id: uuidv4(),
    name,
    email,
    plan: "free",
    createdAt: new Date().toISOString(),
  };
}

function createLocalSession(userId: string): AuthSession {
  return {
    accessToken: `local_${userId}_${Date.now()}`,
    refreshToken: `local_refresh_${userId}`,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    userId,
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(
  name: string,
  email: string,
  password: string
): Promise<{ user: User; session: AuthSession }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      await saveUser(data.user);
      await saveSession(data.session);
      return data;
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || (await res.text()) || "Registration failed");
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      const user = createLocalUser(name, email);
      const session = createLocalSession(user.id);
      await saveUser(user);
      await saveSession(session);
      return { user, session };
    }
    throw err;
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ user: User; session: AuthSession }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      await saveUser(data.user);
      await saveSession(data.session);
      return data;
    }
    const errBody = await res.json().catch(() => ({ error: "" }));
    throw new Error(errBody.error || "Invalid email or password");
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError")) {
      // Offline - check if we have local user data
      const existingSession = await getAnySession();
      if (existingSession) {
        const existingUser = await getUser(existingSession.userId);
        if (existingUser && existingUser.email === email) {
          return { user: existingUser, session: existingSession };
        }
      }
      // Create offline account
      const user = createLocalUser(email.split("@")[0], email);
      const session = createLocalSession(user.id);
      await saveUser(user);
      await saveSession(session);
      return { user, session };
    }
    throw err;
  }
}

// ─── Google Login ─────────────────────────────────────────────────────────────
// Web: redirect to backend Google OAuth flow; callback redirects to /auth/callback with session.
// Native (Tauri): open system browser to same URL; callback redirects to /auth/desktop-success then deep link.

export function getGoogleAuthUrl(): string {
  return `${getApiBase()}/api/auth/google?client=${isTauri() ? "desktop" : "web"}`;
}

/** Starts Google OAuth. For web: redirects. For native: opens system browser; app should handle deep link or desktop-success page. */
export function loginWithGoogleRedirect(): void {
  window.location.href = getGoogleAuthUrl();
}

// ─── Forgot / Reset Password ──────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Request failed. Please try again.");
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: newPassword }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to reset password");
  }
}

export async function resendVerification(): Promise<void> {
  const session = await getAnySession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to send verification email");
  }
}

export async function changePassword(_userId: string, newPassword: string): Promise<void> {
  const session = await getAnySession();
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.accessToken}`,
    },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error("Failed to change password");
}

// ─── Refresh session (get new access token using refresh token) ─────────────────

export async function refreshSession(): Promise<{ user: User; session: AuthSession } | null> {
  const savedSession = await getAnySession();
  if (!savedSession?.refreshToken || savedSession.refreshToken.startsWith("local_")) {
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: savedSession.refreshToken }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await saveUser(data.user);
    await saveSession(data.session);
    return { user: data.user, session: data.session };
  } catch {
    return null;
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(userId: string): Promise<void> {
  try {
    const session = await getAnySession();
    if (session) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(3000),
      });
    }
  } catch {
    // ignore network errors
  }
  await deleteSession(userId);
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, updates: Partial<User>): Promise<User> {
  const existingUser = await getUser(userId);
  if (!existingUser) throw new Error("User not found");

  const updated: User = { ...existingUser, ...updates };

  try {
    const session = await getAnySession();
    const res = await fetch(`${API_BASE}/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.accessToken}`,
      },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const serverUser = await res.json();
      await saveUser(serverUser);
      return serverUser;
    }
  } catch {
    // Fall through to local update
  }

  await saveUser(updated);
  return updated;
}

// ─── Request email change (sends verification link to new email) ───────────────

export async function requestEmailChange(newEmail: string): Promise<void> {
  const session = await getAnySession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/auth/request-email-change`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to send confirmation email.");
  }
}

// ─── Delete Account ───────────────────────────────────────────────────────────

export async function deleteAccount(userId: string): Promise<void> {
  try {
    const session = await getAnySession();
    await fetch(`${API_BASE}/api/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // ignore
  }
  await deleteSession(userId);
  // Clear all local data (IndexedDB or native SQLite in Tauri)
  const { clearAll } = await import("./db");
  await clearAll();
}
