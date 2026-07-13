import type { User, AuthSession } from "../types/todo";
import { saveUser, getUser, saveSession, getAnySession, deleteSession } from "./db";
import { getApiBase } from "./apiBase";
import { mapUserFromApi } from "./mapUserFromApi";

const API_BASE = getApiBase();

/** Wipe prior local account data before persisting a new sign-in. */
async function clearLocalAuthState(): Promise<void> {
  const { clearAllTimers } = await import("./notificationService");
  clearAllTimers();
  const { clearAll } = await import("./db");
  await clearAll();
}

function isValidAuthPayload(data: unknown): data is { user: User; session: AuthSession } {
  if (!data || typeof data !== "object") return false;
  const d = data as { user?: User; session?: AuthSession };
  return Boolean(
    d.user?.id &&
      d.session?.accessToken &&
      d.session?.userId &&
      d.session.userId === d.user.id
  );
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
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      if (!isValidAuthPayload(data)) {
        throw new Error("Invalid registration response");
      }
      await clearLocalAuthState();
      const mappedUser = mapUserFromApi(data.user as unknown as Record<string, unknown>);
      await saveUser(mappedUser);
      await saveSession(data.session);
      return { user: mappedUser, session: data.session };
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
      if (!isValidAuthPayload(data)) {
        throw new Error("Invalid login response");
      }
      await clearLocalAuthState();
      const mappedUser = mapUserFromApi(data.user as unknown as Record<string, unknown>);
      await saveUser(mappedUser);
      await saveSession(data.session);
      return { user: mappedUser, session: data.session };
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
// Desktop Tauri: open browser, poll backend for code, then exchange.
// Android/iOS: native account picker (Credential Manager / Google Sign-In) → POST idToken.

export function getGoogleAuthUrl(): string {
  // Always web. Desktop must use startDesktopGoogleLogin (needs requestId + pollSecret).
  return `${getApiBase()}/api/auth/google?client=web`;
}

/** Starts Google OAuth. For web: redirects. For native: use startDesktopGoogleLogin + poll instead. */
export function loginWithGoogleRedirect(): void {
  window.location.href = getGoogleAuthUrl();
}

/** Web client ID used as ID-token audience for native Android/iOS Google Sign-In. */
export function getGoogleWebClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
}

function mapNativeGoogleError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "Google sign-in failed.";
  if (/cancel/i.test(msg)) return msg;
  if (/No Google account/i.test(msg)) {
    return (
      "Google could not offer an account for this app. Confirm a Google account is signed in " +
      "on the device, then check Google Cloud Console: Android OAuth client for package " +
      "com.roboticela.todo with this build’s SHA-1 (run npm run android:sha1), and use the " +
      "Web client ID as VITE_GOOGLE_CLIENT_ID."
    );
  }
  // Common Credential Manager / Play Services failures when Android OAuth client or SHA-1 is missing
  if (
    /Credential error|GetCredential|28444|Developer console|not set up correctly|16:/i.test(msg)
  ) {
    return (
      "Google account picker could not verify this app. In Google Cloud Console, create an " +
      "Android OAuth client for package com.roboticela.todo and add your debug/release SHA-1 fingerprint. " +
      "Use the Web client ID as VITE_GOOGLE_CLIENT_ID (not the Android client ID)."
    );
  }
  return msg;
}

/**
 * Android / iOS: system Google account picker, then exchange ID token with the API.
 */
export async function loginWithNativeGoogle(): Promise<{ user: User; session: AuthSession }> {
  const clientId = getGoogleWebClientId();
  if (!clientId) {
    throw new Error(
      "Google Sign-In is not configured (missing VITE_GOOGLE_CLIENT_ID). Rebuild after setting it in .env."
    );
  }
  const { signIn } = await import("@choochmeque/tauri-plugin-google-auth-api");
  const { getAppRuntime, formatCaughtError } = await import("./platform");

  let tokens;
  try {
    tokens = await signIn({
      clientId,
      scopes: ["openid", "email", "profile"],
      ...(getAppRuntime() === "android" ? { flowType: "native" as const } : {}),
    });
  } catch (e) {
    throw new Error(mapNativeGoogleError(formatCaughtError(e, "Google sign-in failed.")));
  }

  if (!tokens.idToken) {
    throw new Error("Google did not return an ID token. Please try again.");
  }

  const res = await fetch(`${API_BASE}/api/auth/google/native`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: tokens.idToken }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Google sign-in failed");
  }
  const data = await res.json();
  if (!isValidAuthPayload(data)) {
    throw new Error("Invalid Google sign-in response");
  }
  await clearLocalAuthState();
  const mappedUser = mapUserFromApi(data.user as unknown as Record<string, unknown>);
  await saveUser(mappedUser);
  await saveSession(data.session);
  return { user: mappedUser, session: data.session };
}

/** Desktop only: start Google sign-in. Opens Google directly; app polls until browser finishes. */
export async function startDesktopGoogleLogin(): Promise<{
  requestId: string;
  pollSecret: string;
  userCode: string;
  verificationUrl: string;
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

/** Native (desktop/mobile): poll backend for one-time code (after user completed Google sign-in in browser). Returns code or null on timeout. */
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
    try {
      const url = `${API_BASE}/api/auth/desktop-pending?requestId=${encodeURIComponent(requestId)}`;
      const res = await fetch(url, {
        headers: { "x-poll-secret": pollSecret },
        signal: AbortSignal.timeout(intervalMs + 1000),
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data?.code) return data.code;
      }
      if (res.status === 401) {
        return null;
      }
    } catch {
      // Transient errors are common while the app is backgrounded (Android/iOS); keep polling.
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
    signal: AbortSignal.timeout(15000),
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
  userId: string,
  newPassword: string,
  currentPassword?: string
): Promise<void> {
  const session = await getSession(userId);
  if (!session) throw new Error("Not signed in");
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ newPassword, currentPassword }),
    signal: AbortSignal.timeout(15000),
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
    if (!isValidAuthPayload(data)) return null;
    const mappedUser = mapUserFromApi(data.user as unknown as Record<string, unknown>);
    await saveUser(mappedUser);
    await saveSession(data.session);
    return { user: mappedUser, session: data.session };
  } catch {
    return null;
  }
}

export { clearLocalAuthState, isValidAuthPayload };

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(userId: string): Promise<void> {
  try {
    const session = await getSession(userId);
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
  const { clearAllTimers } = await import("./notificationService");
  clearAllTimers();
  // Wipe local tasks/completions/notifications so another account on this device
  // cannot see prior data or receive prior reminders
  const { clearAll, deleteSession } = await import("./db");
  await deleteSession(userId);
  await clearAll();
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, updates: Partial<User>): Promise<User> {
  const existingUser = await getUser(userId);
  if (!existingUser) throw new Error("User not found");

  const session = await getAnySession();
  // Offline / local-only sessions may update locally
  if (!session || session.accessToken.startsWith("local_")) {
    const updated: User = { ...existingUser, ...updates };
    await saveUser(updated);
    return updated;
  }

  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(updates),
    // Sound/avatar data URLs need more time to upload to R2
    signal: AbortSignal.timeout(
      typeof updates.customSoundUrl === "string" && updates.customSoundUrl.startsWith("data:")
        ? 60000
        : typeof updates.avatarUrl === "string" && updates.avatarUrl.startsWith("data:")
          ? 30000
          : 5000
    ),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Could not update profile");
  }
  const serverUser = await res.json();
  const mapped = mapUserFromApi(serverUser);
  await saveUser(mapped);
  return mapped;
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
  const { clearAllTimers } = await import("./notificationService");
  clearAllTimers();
  await deleteSession(userId);
  const { clearAll } = await import("./db");
  await clearAll();
}
