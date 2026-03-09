import { Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirySeconds } from "../services/jwtService.js";
import { sendPasswordResetEmail, sendWelcomeEmail } from "../services/emailService.js";
import { uploadAvatarFromUrl } from "../services/r2Service.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const googleClient = config.google.clientId && config.google.clientSecret
  ? new OAuth2Client(config.google.clientId, config.google.clientSecret, undefined)
  : null;

function toUserResponse(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? undefined,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : undefined,
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
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        plan: "free",
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

    sendWelcomeEmail(user.email, user.name).catch(() => {});

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
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user) {
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });
      await sendPasswordResetEmail(user.email, token, user.name);
    }
    // Always return success to avoid email enumeration
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

// ─── Google OAuth: redirect to Google ──────────────────────────────────────────

router.get("/google", (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: "Google sign-in is not configured" });
  }
  const client = req.query.client || "web"; // web | desktop
  const state = Buffer.from(JSON.stringify({ client })).toString("base64url");
  const redirectUri = `${config.frontendUrl}/auth/callback`;
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
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      client = decoded.client || "web";
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
        plan: "free",
      },
    });
  } else {
    const updateData = {};
    if (!user.googleId) updateData.googleId = googleId;
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
    // Native app: redirect to success page that redirects to app deep link
    const deepUrl = `${config.appDeepLinkScheme}://auth?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&userId=${encodeURIComponent(user.id)}`;
    const successUrl = `${config.frontendUrl}/auth/desktop-success?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}&userId=${encodeURIComponent(user.id)}`;
    return res.redirect(successUrl);
  }

  // Web: redirect to SPA with tokens in hash (base64 JSON; hash not sent to server)
  const sessionPayload = {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + getExpirySeconds(config.jwt.accessExpiry) * 1000).toISOString(),
    userId: user.id,
  };
  const hash = Buffer.from(JSON.stringify(sessionPayload)).toString("base64");
  return res.redirect(`${config.frontendUrl}/auth/callback#${hash}`);
});

export default router;
