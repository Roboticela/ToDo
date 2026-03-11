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
import { uploadAvatarFromUrl } from "../services/r2Service.js";
import { requireAuth } from "../middleware/auth.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();

// One-time codes for desktop OAuth: app gets code by polling (no tokens in browser URL)
const DESKTOP_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const desktopAuthCodes = new Map(); // code -> { accessToken, refreshToken, userId, expiresAt }
const desktopPendingAuth = new Map(); // requestId -> { code }

function createDesktopAuthCode(accessToken, refreshToken, userId) {
  const code = crypto.randomBytes(24).toString("hex");
  desktopAuthCodes.set(code, {
    accessToken,
    refreshToken,
    userId,
    expiresAt: Date.now() + DESKTOP_CODE_TTL_MS,
  });
  return code;
}

function consumeDesktopAuthCode(code) {
  if (!code || typeof code !== "string") return null;
  const entry = desktopAuthCodes.get(code);
  desktopAuthCodes.delete(code);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry;
}

const googleClient = config.google.clientId && config.google.clientSecret
  ? new OAuth2Client(config.google.clientId, config.google.clientSecret, undefined)
  : null;

function toUserResponse(user) {
  const effective = getEffectivePlan(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? undefined,
    plan: effective.plan,
    planExpiresAt: effective.planExpiresAt ? effective.planExpiresAt.toISOString() : undefined,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : undefined,
    subscribedToReminders: user.subscribedToReminders ?? true,
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
        plan: "pending",
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: verificationExpiresAt,
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
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const accessToken = signAccessToken({ userId: user.id });
    const newRefreshToken = signRefreshToken({ userId: user.id });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.refreshExpiry) * 1000),
      },
    });

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

    if (!user) {
      return res.status(404).json({ error: "No account found with this email address." });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });
    await sendPasswordResetEmail(user.email, token, user.name, user.id);

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
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
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

router.post("/desktop-login-start", (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: "Google sign-in is not configured" });
  }
  const requestId = uuidv4();
  const state = Buffer.from(JSON.stringify({ client: "desktop", requestId })).toString("base64url");
  const scope = "openid email profile";
  const authUrl = googleClient.generateAuthUrl({
    access_type: "offline",
    scope,
    state,
    redirect_uri: `${config.backendUrl}/api/auth/google/callback`,
    prompt: "consent",
  });
  res.json({ authUrl, requestId });
});

router.get("/desktop-pending", (req, res) => {
  const requestId = req.query.requestId;
  if (!requestId) {
    return res.status(400).json({ error: "Missing requestId" });
  }
  const entry = desktopPendingAuth.get(requestId);
  desktopPendingAuth.delete(requestId);
  if (!entry?.code) {
    return res.status(204).send();
  }
  res.json({ code: entry.code });
});

// ─── Google OAuth: callback (exchange code, create session, redirect) ───────────

router.get("/google/callback", async (req, res) => {
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
  googleClient.setCredentials({ access_token: tokens.id_token });
  const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
  const payload = ticket.getPayload();
  const googleId = payload.sub;
  const email = payload.email;
  const name = payload.name || payload.email?.split("@")[0] || "User";
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
        plan: "pending",
        emailVerifiedAt: new Date(),
      },
    });
  } else {
    const updateData = {};
    if (!user.googleId) updateData.googleId = googleId;
    if (!user.emailVerifiedAt) updateData.emailVerifiedAt = new Date();
    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }
  }

  if (googlePictureUrl && !user.avatarUrl) {
    const r2AvatarUrl = await uploadAvatarFromUrl(googlePictureUrl, user.id);
    if (r2AvatarUrl) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: r2AvatarUrl },
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

  if (client === "desktop") {
    // Native app: store code on backend keyed by requestId; app polls GET desktop-pending and exchanges code via API
    const authCode = createDesktopAuthCode(accessToken, refreshToken, user.id);
    if (requestId) {
      desktopPendingAuth.set(requestId, { code: authCode });
    }
    return res.redirect(`${config.frontendUrl}/auth/desktop-success`);
  }

  // Web: redirect to SPA with tokens in query params (hash is often stripped by proxies)
  const expiresAt = new Date(Date.now() + getExpirySeconds(config.jwt.accessExpiry) * 1000).toISOString();
  const callbackUrl = new URL(`${config.frontendUrl}/auth/callback`);
  callbackUrl.searchParams.set("token", accessToken);
  callbackUrl.searchParams.set("refresh", refreshToken);
  callbackUrl.searchParams.set("userId", user.id);
  callbackUrl.searchParams.set("expiresAt", expiresAt);
  return res.redirect(callbackUrl.toString());
});

// ─── Desktop: exchange one-time code for tokens (no tokens in URL / deep link) ───

router.post("/desktop-exchange", async (req, res) => {
  const { code } = req.body || {};
  const entry = consumeDesktopAuthCode(code);
  if (!entry) {
    return res.status(401).json({ error: "Invalid or expired code. Please sign in with Google again." });
  }
  res.json({
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    userId: entry.userId,
  });
});

export default router;
