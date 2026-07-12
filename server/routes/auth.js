import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirySeconds } from "../services/jwtService.js";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendEmailChangeEmail,
} from "../services/emailService.js";
import { uploadAvatarFromUrl, isR2ApiEndpointUrl } from "../services/r2Service.js";
import { requireAuth } from "../middleware/auth.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();

// One-time codes for desktop/web OAuth (persisted so restarts / multi-instance work)
const DESKTOP_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_GRACE_MS = 30 * 1000; // concurrent tab refresh window

async function sweepDesktopAuth() {
  const now = new Date();
  await prisma.desktopAuthCode.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.desktopPendingAuth.deleteMany({ where: { expiresAt: { lt: now } } });
}

async function createDesktopAuthCode(accessToken, refreshToken, userId) {
  await sweepDesktopAuth();
  const code = crypto.randomBytes(24).toString("hex");
  await prisma.desktopAuthCode.create({
    data: {
      code,
      accessToken,
      refreshToken,
      userId,
      expiresAt: new Date(Date.now() + DESKTOP_CODE_TTL_MS),
    },
  });
  return code;
}

async function consumeDesktopAuthCode(code) {
  if (!code || typeof code !== "string") return null;
  await sweepDesktopAuth();
  const entry = await prisma.desktopAuthCode.findUnique({ where: { code } });
  if (!entry) return null;
  await prisma.desktopAuthCode.delete({ where: { code } }).catch(() => {});
  if (new Date() > entry.expiresAt) return null;
  return entry;
}

const googleClient = config.google.clientId && config.google.clientSecret
  ? new OAuth2Client(config.google.clientId, config.google.clientSecret, undefined)
  : null;

function toUserResponse(user) {
  const effective = getEffectivePlan(user);
  const soundMode = user.notificationSoundMode;
  let notificationSoundMode = "preset";
  if (soundMode === "custom") notificationSoundMode = "custom";
  else if (soundMode === "normal") notificationSoundMode = "normal";
  else if (soundMode === "ringtone" || soundMode === "preset") notificationSoundMode = "preset";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? undefined,
    plan: effective.plan,
    planExpiresAt: effective.planExpiresAt ? effective.planExpiresAt.toISOString() : undefined,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : undefined,
    subscribedToReminders: user.subscribedToReminders ?? true,
    taskNotificationsEnabled: user.taskNotificationsEnabled ?? true,
    notificationSoundMode,
    notificationSoundId:
      notificationSoundMode === "preset"
        ? user.notificationSoundId || "notify-correct"
        : user.notificationSoundId ?? undefined,
    customSoundUrl: user.customSoundUrl ?? undefined,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
}

function toSessionResponse(user, accessToken, refreshToken) {
  const expiresIn = getExpirySeconds(config.jwt.accessExpiry);
  return {
    user: toUserResponse(user),
    session: {
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      userId: user.id,
    },
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = uuidv4();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        plan: "free",
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: verificationExpiresAt,
        taskNotificationsEnabled: true,
        notificationSoundMode: "preset",
        notificationSoundId: "notify-correct",
      },
    });

    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.refreshExpiry) * 1000),
      },
    });

    sendWelcomeEmail(user.email, user.name, user.id).catch((err) => {
      console.warn("[auth] register: welcome email failed", err?.message || err);
    });
    sendVerificationEmail(user.email, user.name, verificationToken, user.id).catch((err) => {
      console.warn("[auth] register: verification email failed", err?.message || err);
    });

    res.status(201).json(toSessionResponse(user, accessToken, refreshToken));
  } catch (e) {
    console.error("[auth] register", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.refreshExpiry) * 1000),
      },
    });

    res.json(toSessionResponse(user, accessToken, refreshToken));
  } catch (e) {
    console.error("[auth] login", e);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken: bodyToken } = req.body;
    const token = bodyToken || req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    const payload = verifyRefreshToken(token);
    const now = new Date();
    // Must match a stored session so logout/revoke invalidates refresh.
    // Also accept the previous token briefly so concurrent tabs don't race.
    const stored = await prisma.session.findFirst({
      where: {
        userId: payload.userId,
        OR: [
          { refreshToken: token },
          {
            previousRefreshToken: token,
            previousRefreshValidUntil: { gt: now },
          },
        ],
      },
    });
    if (!stored || now > stored.expiresAt) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Second tab hit the grace window — return the already-rotated tokens
    if (stored.previousRefreshToken === token && stored.refreshToken !== token) {
      return res.json(toSessionResponse(user, stored.accessToken, stored.refreshToken));
    }

    const accessToken = signAccessToken({ userId: user.id });
    const newRefreshToken = signRefreshToken({ userId: user.id });
    // Conditional update so two tabs rotating the same token don't orphan each other
    const rotated = await prisma.session.updateMany({
      where: { id: stored.id, refreshToken: token },
      data: {
        accessToken,
        previousRefreshToken: stored.refreshToken,
        previousRefreshValidUntil: new Date(Date.now() + REFRESH_GRACE_MS),
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.refreshExpiry) * 1000),
      },
    });
    if (rotated.count === 0) {
      const again = await prisma.session.findUnique({ where: { id: stored.id } });
      if (
        again &&
        again.previousRefreshToken === token &&
        again.refreshToken !== token &&
        again.previousRefreshValidUntil &&
        again.previousRefreshValidUntil > now
      ) {
        return res.json(toSessionResponse(user, again.accessToken, again.refreshToken));
      }
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    res.json(toSessionResponse(user, accessToken, newRefreshToken));
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────────

router.post("/logout", requireAuth, async (req, res) => {
  try {
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      await prisma.session.deleteMany({
        where: { userId: req.user.id, accessToken: token },
      });
    }
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

// ─── Forgot password ───────────────────────────────────────────────────────────

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always return the same message to avoid email enumeration
    if (user) {
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      // Invalidate prior unused reset tokens for this user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });
      await sendPasswordResetEmail(user.email, token, user.name, user.id);
    }

    res.json({ message: "If an account exists, you will receive reset instructions." });
  } catch (e) {
    console.error("[auth] forgot-password", e);
    res.status(500).json({ error: "Request failed" });
  }
});

// ─── Reset password (with token from email) ────────────────────────────────────

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Token and new password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const reset = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!reset || reset.usedAt || new Date() > reset.expiresAt) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId: reset.userId } }),
    ]);

    res.json({ message: "Password updated. You can now sign in." });
  } catch (e) {
    console.error("[auth] reset-password", e);
    res.status(500).json({ error: "Reset failed" });
  }
});

// ─── Change password (authenticated) ─────────────────────────────────────────

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { newPassword, currentPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    if (!currentPassword || typeof currentPassword !== "string") {
      return res.status(400).json({ error: "Current password is required" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.passwordHash) {
      return res.status(400).json({ error: "Password login is not set for this account. Use Google sign-in or reset via email." });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });
    // Invalidate other sessions after password change
    await prisma.session.deleteMany({
      where: {
        userId: req.user.id,
        NOT: { accessToken: req.headers.authorization?.replace(/^Bearer\s+/i, "") || "" },
      },
    });
    res.json({ message: "Password updated" });
  } catch (e) {
    console.error("[auth] change-password", e);
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── Email verification ───────────────────────────────────────────────────────

router.get("/verify-email", async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.redirect(`${config.frontendUrl}/auth/login?error=missing_token`);
  }
  const user = await prisma.user.findFirst({
    where: { emailVerificationToken: token },
  });
  if (!user || !user.emailVerificationTokenExpiresAt || new Date() > user.emailVerificationTokenExpiresAt) {
    return res.redirect(`${config.frontendUrl}/auth/login?error=invalid_or_expired_verification`);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
    },
  });
  return res.redirect(`${config.frontendUrl}/auth/verified`);
});

router.post("/resend-verification", requireAuth, async (req, res) => {
  const user = req.user;
  if (user.emailVerifiedAt) {
    return res.status(400).json({ error: "Email is already verified" });
  }
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: token,
      emailVerificationTokenExpiresAt: expiresAt,
    },
  });
  await sendVerificationEmail(user.email, user.name, token, user.id);
  return res.json({ message: "Verification email sent." });
});

// ─── Email change ─────────────────────────────────────────────────────────────

router.post("/request-email-change", requireAuth, async (req, res) => {
  const newEmail = req.body.newEmail?.trim()?.toLowerCase();
  if (!newEmail) {
    return res.status(400).json({ error: "New email is required" });
  }
  if (newEmail === req.user.email) {
    return res.status(400).json({ error: "New email is the same as current" });
  }
  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }
  const confirmToken = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      pendingEmail: newEmail,
      pendingEmailToken: confirmToken,
      pendingEmailTokenExpiresAt: expiresAt,
    },
  });
  await sendEmailChangeEmail(newEmail, req.user.name, newEmail, confirmToken, req.user.id);
  return res.json({ message: "Confirmation email sent to your new address." });
});

router.get("/confirm-email-change", async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.redirect(`${config.frontendUrl}/todo/settings?error=missing_token`);
  }
  const user = await prisma.user.findFirst({
    where: { pendingEmailToken: token },
  });
  if (!user || !user.pendingEmail || !user.pendingEmailTokenExpiresAt || new Date() > user.pendingEmailTokenExpiresAt) {
    return res.redirect(`${config.frontendUrl}/todo/settings?error=invalid_or_expired`);
  }
  const taken = await prisma.user.findFirst({
    where: {
      email: user.pendingEmail,
      NOT: { id: user.id },
    },
  });
  if (taken) {
    return res.redirect(`${config.frontendUrl}/todo/settings?error=email_taken`);
  }
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        emailVerifiedAt: new Date(),
        pendingEmail: null,
        pendingEmailToken: null,
        pendingEmailTokenExpiresAt: null,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.redirect(`${config.frontendUrl}/todo/settings?error=email_taken`);
    }
    throw e;
  }
  return res.redirect(`${config.frontendUrl}/todo/settings?email_changed=1`);
});

// ─── Google OAuth: redirect to Google ──────────────────────────────────────────

router.get("/google", (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: "Google sign-in is not configured" });
  }
  const client = req.query.client || "web"; // web | desktop
  const state = Buffer.from(JSON.stringify({ client })).toString("base64url");
  const scope = "openid email profile";
  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    scope,
    state,
    redirect_uri: `${config.backendUrl}/api/auth/google/callback`,
    prompt: "consent",
  });
  res.redirect(url);
});

// ─── Desktop: app gets auth URL from backend, then polls for code (no deep link / paste) ───

router.post("/desktop-login-start", async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: "Google sign-in is not configured" });
  }
  const requestId = uuidv4();
  const pollSecret = uuidv4();
  await sweepDesktopAuth();
  await prisma.desktopPendingAuth.create({
    data: {
      requestId,
      pollSecret,
      expiresAt: new Date(Date.now() + DESKTOP_CODE_TTL_MS),
    },
  });
  const state = Buffer.from(JSON.stringify({ client: "desktop", requestId })).toString("base64url");
  const scope = "openid email profile";
  const authUrl = googleClient.generateAuthUrl({
    access_type: "offline",
    scope,
    state,
    redirect_uri: `${config.backendUrl}/api/auth/google/callback`,
    prompt: "consent",
  });
  res.json({ authUrl, requestId, pollSecret });
});

router.get("/desktop-pending", async (req, res) => {
  await sweepDesktopAuth();
  const requestId = req.query.requestId;
  const pollSecret = req.headers["x-poll-secret"];
  if (!requestId || !pollSecret) {
    return res.status(400).json({ error: "Missing requestId or pollSecret" });
  }
  const entry = await prisma.desktopPendingAuth.findUnique({ where: { requestId: String(requestId) } });
  if (!entry || entry.pollSecret !== pollSecret) {
    return res.status(401).json({ error: "Invalid poll credentials" });
  }
  if (new Date() > entry.expiresAt) {
    await prisma.desktopPendingAuth.delete({ where: { requestId: entry.requestId } }).catch(() => {});
    return res.status(401).json({ error: "Sign-in expired" });
  }
  // Do not delete the slot until a code is ready (preserves pollSecret across empty polls)
  if (!entry.code) {
    return res.status(204).send();
  }
  await prisma.desktopPendingAuth.delete({ where: { requestId: entry.requestId } }).catch(() => {});
  res.json({ code: entry.code });
});

// ─── Google OAuth: callback (exchange code, create session, redirect) ───────────

router.get("/google/callback", async (req, res) => {
  try {
    if (!googleClient) {
      return res.redirect(`${config.frontendUrl}/auth/login?error=google_not_configured`);
    }
    const { code, state } = req.query;
    if (!code) {
      return res.redirect(`${config.frontendUrl}/auth/login?error=missing_code`);
    }

    let client = "web";
    let requestId = null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
        client = decoded.client || "web";
        requestId = decoded.requestId || null;
      } catch {
        // ignore
      }
    }

    const redirectUri = `${config.backendUrl}/api/auth/google/callback`;
    const { tokens } = await googleClient.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.id_token) {
      return res.redirect(`${config.frontendUrl}/auth/login?error=google_failed`);
    }
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = (payload.email || "").trim().toLowerCase();
    if (!email) {
      return res.redirect(`${config.frontendUrl}/auth/login?error=google_email_missing`);
    }
    const name = payload.name || email.split("@")[0] || "User";
    const googlePictureUrl = payload.picture || null;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          googleId,
          plan: "free",
          emailVerifiedAt: new Date(),
          taskNotificationsEnabled: true,
          notificationSoundMode: "preset",
          notificationSoundId: "notify-correct",
        },
      });
    } else if (user.googleId && user.googleId !== googleId) {
      return res.redirect(`${config.frontendUrl}/auth/login?error=email_linked_other_google`);
    } else if (!user.googleId && user.email.toLowerCase() === email) {
      // Only auto-link when Google asserts the email is verified
      if (payload.email_verified !== true) {
        return res.redirect(`${config.frontendUrl}/auth/login?error=google_email_unverified`);
      }
      const updateData = { googleId, emailVerifiedAt: user.emailVerifiedAt || new Date() };
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    } else {
      const updateData = {};
      if (!user.emailVerifiedAt) updateData.emailVerifiedAt = new Date();
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }

    // Upload Google photo to R2 when public access is configured; otherwise store Google URL.
    const needsAvatar =
      googlePictureUrl &&
      (!user.avatarUrl || isR2ApiEndpointUrl(user.avatarUrl));
    if (needsAvatar) {
      const r2AvatarUrl = await uploadAvatarFromUrl(googlePictureUrl, user.id);
      const avatarUrl = r2AvatarUrl || googlePictureUrl;
      if (avatarUrl !== user.avatarUrl) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl },
        });
      }
    }

    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.refreshExpiry) * 1000),
      },
    });

    // One-time code for both web and desktop — never put tokens in the browser URL
    const authCode = await createDesktopAuthCode(accessToken, refreshToken, user.id);

    if (client === "desktop") {
      if (!requestId) {
        // Desktop without requestId cannot be polled — force the start+poll flow
        return res.redirect(`${config.frontendUrl}/auth/login?error=desktop_restart_required`);
      }
      const pending = await prisma.desktopPendingAuth.findUnique({ where: { requestId } });
      if (!pending) {
        return res.redirect(`${config.frontendUrl}/auth/login?error=desktop_restart_required`);
      }
      await prisma.desktopPendingAuth.update({
        where: { requestId },
        data: {
          code: authCode,
          expiresAt: new Date(Date.now() + DESKTOP_CODE_TTL_MS),
        },
      });
      return res.redirect(`${config.frontendUrl}/auth/desktop-success`);
    }

    // Put code in the URL hash (not query) so Referer headers don't leak it
    return res.redirect(`${config.frontendUrl}/auth/callback#code=${encodeURIComponent(authCode)}`);
  } catch (e) {
    console.error("[auth] google/callback", e);
    return res.redirect(`${config.frontendUrl}/auth/login?error=google_failed`);
  }
});

// ─── Exchange one-time code for tokens (web + desktop; no tokens in URL) ───

router.post("/desktop-exchange", async (req, res) => {
  const { code } = req.body || {};
  const entry = await consumeDesktopAuthCode(code);
  if (!entry) {
    return res.status(401).json({ error: "Invalid or expired code. Please sign in with Google again." });
  }
  const user = await prisma.user.findUnique({ where: { id: entry.userId } });
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  res.json(toSessionResponse(user, entry.accessToken, entry.refreshToken));
});

export default router;
