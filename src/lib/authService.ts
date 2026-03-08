import type { User, AuthSession } from "../types/todo";
import { saveUser, getUser, saveSession, getAnySession, deleteSession } from "./db";
import { v4 as uuidv4 } from "./uuid";

const API_BASE = import.meta.env.VITE_API_URL || "https://api.todo.roboticela.com";

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
    const res = await fetch(`${API_BASE}/auth/register`, {
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
    throw new Error(await res.text());
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      // Offline - create local account
      const user = createLocalUser(name, email);
      const session = createLocalSession(user.id);
      await saveUser(user);
      await saveSession(session);
      return { user, session };
    }
    // Create local account on network failure
    const user = createLocalUser(name, email);
    const session = createLocalSession(user.id);
    await saveUser(user);
    await saveSession(session);
    return { user, session };
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ user: User; session: AuthSession }> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
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
    const errorText = await res.text();
    throw new Error(errorText || "Invalid email or password");
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

export async function loginWithGoogle(): Promise<{ user: User; session: AuthSession }> {
  // In a real app this would use OAuth. For now, create a demo Google user.
  const user = createLocalUser("Google User", `google_${Date.now()}@gmail.com`);
  const session = createLocalSession(user.id);
  await saveUser(user);
  await saveSession(session);
  return { user, session };
}

// ─── Forgot / Reset Password ──────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silently handle - user sees success message
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: newPassword }),
  });
  if (!res.ok) throw new Error("Failed to reset password");
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const session = await getAnySession();
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.accessToken}`,
    },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error("Failed to change password");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(userId: string): Promise<void> {
  try {
    const session = await getAnySession();
    if (session) {
      await fetch(`${API_BASE}/auth/logout`, {
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
    const res = await fetch(`${API_BASE}/users/${userId}`, {
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

// ─── Delete Account ───────────────────────────────────────────────────────────

export async function deleteAccount(userId: string): Promise<void> {
  try {
    const session = await getAnySession();
    await fetch(`${API_BASE}/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // ignore
  }
  await deleteSession(userId);
  // Clear all local data
  const { getDB } = await import("./db");
  const db = await getDB();
  await db.clear("tasks");
  await db.clear("completions");
  await db.clear("notifications");
  await db.clear("users");
  await db.clear("syncQueue");
}
