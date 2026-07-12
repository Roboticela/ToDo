import { verifyAccessToken } from "../services/jwtService.js";
import { prisma } from "../lib/prisma.js";

/**
 * Require valid Bearer access token that matches a stored session.
 * Sets req.user and req.sessionUser (DB user).
 */
export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.session.findFirst({
      where: { userId: payload.userId, accessToken: token },
    });
    if (!session || new Date() > session.expiresAt) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.user = user;
    req.sessionUser = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth: if valid token present and session exists, sets req.user; otherwise continues without it.
 */
export async function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.session.findFirst({
      where: { userId: payload.userId, accessToken: token },
    });
    if (!session || new Date() > session.expiresAt) return next();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (user) req.user = user;
  } catch {
    // ignore
  }
  next();
}
