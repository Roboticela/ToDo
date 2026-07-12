import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadAvatarFromDataUrl, deleteAvatarByUrl } from "../services/r2Service.js";
import { getEffectivePlan } from "../lib/planUtils.js";
import { config } from "../config.js";
import { cancelActiveSubscriptionsForUser } from "./paddle.js";

const router = Router();

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
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/me", requireAuth, (req, res) => {
  res.json(toUserResponse(req.user));
});

router.patch("/:userId", requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { name, avatarUrl, subscribedToReminders, plan } = req.body;
  // Email cannot be changed via PATCH; use request-email-change + confirm-email-change flow
  const updates = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  // Select Free: only from pending (new signup). Paid users must cancel via Paddle portal.
  // Expired paid plans are already effectively free — allow clearing the DB row.
  if (plan === "free") {
    const effective = getEffectivePlan(req.user);
    if (req.user.plan === "pending") {
      updates.plan = "free";
      updates.planExpiresAt = null;
    } else if (effective.plan !== "free") {
      return res.status(400).json({
        error: "Cancel your paid subscription in Manage Subscription to switch to Free.",
      });
    } else if (req.user.plan !== "free") {
      updates.plan = "free";
      updates.planExpiresAt = null;
    }
  }
  if (avatarUrl !== undefined) {
    if (typeof avatarUrl === "string" && avatarUrl.trim()) {
      if (avatarUrl.startsWith("data:")) {
        const r2Url = await uploadAvatarFromDataUrl(avatarUrl, req.user.id);
        if (!r2Url) {
          return res.status(502).json({ error: "Avatar upload failed. Please try again." });
        }
        const previous = req.user.avatarUrl;
        updates.avatarUrl = r2Url;
        // Delete old object only after the new upload succeeds
        if (previous && previous !== r2Url) {
          await deleteAvatarByUrl(previous);
        }
      } else {
        // Only allow our R2 public host (or clearing); reject arbitrary third-party URLs
        const publicBase = (config.r2?.publicUrl || "").replace(/\/$/, "");
        const trimmed = avatarUrl.trim();
        if (publicBase && trimmed.startsWith(publicBase + "/")) {
          updates.avatarUrl = trimmed;
        } else {
          return res.status(400).json({ error: "Avatar must be uploaded as an image" });
        }
      }
    } else {
      if (req.user.avatarUrl) {
        await deleteAvatarByUrl(req.user.avatarUrl);
      }
      updates.avatarUrl = null;
    }
  }
  if (typeof subscribedToReminders === "boolean") updates.subscribedToReminders = subscribedToReminders;
  if (Object.keys(updates).length === 0) {
    return res.json(toUserResponse(req.user));
  }
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: updates,
  });
  res.json(toUserResponse(user));
});

router.delete("/:userId", requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // Stop billing before wiping the account — abort if cancel fails
  const cancelResult = await cancelActiveSubscriptionsForUser(req.user.id);
  if (!cancelResult.ok && cancelResult.attempted > 0) {
    return res.status(502).json({
      error: "Could not cancel your subscription. Open Manage Subscription to cancel, then try deleting again.",
    });
  }
  if (req.user.avatarUrl) {
    await deleteAvatarByUrl(req.user.avatarUrl);
  }
  await prisma.user.delete({ where: { id: req.user.id } });
  res.status(204).end();
});

export default router;
