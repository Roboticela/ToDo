import type { User, AuthSession } from "../types/todo";
import { saveUser, getUser, saveSession, getAnySession, deleteSession } from "./db";
import { isTauri } from "./tauri";
import { getApiBase } from "./apiBase";

const API_BASE = getApiBase();

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
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      await saveUser(data.user);
      await saveSession(data.session);
      return data;
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Registration failed");
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Registration timed out. Check your connection and try again.");
    }
    if (err instanceof TypeError) {
      throw new Error("Cannot reach the server. Check your connection and try again.");
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
      signal: AbortSignal.timeout(15000),
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
      // Never resume a session without verifying the password.
      throw new Error(
        "You're offline. Connect to the internet to sign in with this account."
      );
    }
    throw err;
  }
}

// ─── Google Login ─────────────────────────────────────────────────────────────
// Web: redirect to backend Google OAuth flow; callback redirects to /auth/callback with session.
// Native (Tauri): app gets auth URL from backend, opens browser, polls backend for code, then exchanges code for tokens.

export function getGoogleAuthUrl(): string {
  return `${getApiBase()}/api/auth/google?client=${isTauri() ? "desktop" : "web"}`;
}

/** Starts Google OAuth. For web: redirects. For native: use startDesktopGoogleLogin + poll instead. */
export function loginWithGoogleRedirect(): void {
  window.location.href = getGoogleAuthUrl();
}

/** Desktop only: get auth URL from backend (includes requestId + pollSecret). App opens this URL in browser then polls desktop-pending. */
export async function startDesktopGoogleLogin(): Promise<{
  authUrl: string;
  requestId: string;
  pollSecret: string;
}> {
  const res = await fetch(`${API_BASE}/api/auth/desktop-login-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to start Google sign-in");
  }
  return res.json();
}

/** Desktop only: poll backend for one-time code (after user completed Google sign-in in browser). Returns code or null on timeout. */
export async function pollDesktopPending(
  requestId: string,
  options: { intervalMs?: number; timeoutMs?: number; pollSecret?: string } = {}
): Promise<string | null> {
  const { intervalMs = 2000, timeoutMs = 5 * 60 * 1000, pollSecret } = options;
  if (!pollSecret) {
    throw new Error("pollSecret is required");
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url =
      `${API_BASE}/api/auth/desktop-pending?requestId=${encodeURIComponent(requestId)}` +
      `&pollSecret=${encodeURIComponent(pollSecret)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(intervalMs + 1000),
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data?.code) return data.code;
    }
    if (res.status === 401) {
      return null;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
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

export async function changePassword(
  _userId: string,
  newPassword: string,
  currentPassword?: string
): Promise<void> {
  const session = await getAnySession();
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.accessToken}`,
    },
    body: JSON.stringify({ newPassword, currentPassword }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to change password");
  }
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
  const session = await getAnySession();
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session?.accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok && res.status !== 404) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to delete account on server. Try again.");
  }
  await deleteSession(userId);
  const { clearAll } = await import("./db");
  await clearAll();
}
