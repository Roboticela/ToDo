import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { verifyUnsubscribeToken, createUnsubscribeToken } from "../services/unsubscribeToken.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const EMAIL_PREFERENCES_PAGE = `${config.frontendUrl}/auth/email-preferences`;

router.get("/unsubscribe", async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.redirect(`${EMAIL_PREFERENCES_PAGE}?error=missing_token`);
  }
  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return res.redirect(`${EMAIL_PREFERENCES_PAGE}?error=invalid_token`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { subscribedToReminders: false },
  });
  return res.redirect(`${EMAIL_PREFERENCES_PAGE}?unsubscribed=1`);
});

router.get("/subscribe", async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.redirect(`${EMAIL_PREFERENCES_PAGE}?error=missing_token`);
  }
  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return res.redirect(`${EMAIL_PREFERENCES_PAGE}?error=invalid_token`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { subscribedToReminders: true },
  });
  return res.redirect(`${EMAIL_PREFERENCES_PAGE}?subscribed=1`);
});

router.get("/subscribe-url", requireAuth, (req, res) => {
  const token = createUnsubscribeToken(req.user.id);
  const url = `${config.backendUrl}/api/email/subscribe?token=${encodeURIComponent(token)}`;
  res.json({ url });
});

export default router;
