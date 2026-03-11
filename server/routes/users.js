import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadAvatarFromDataUrl, deleteAvatarByUrl } from "../services/r2Service.js";
import { getEffectivePlan } from "../lib/planUtils.js";

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
  // Only allow setting plan to "free" when current plan is "pending" (new signup must choose plan)
  if (plan === "free" && req.user.plan === "pending") {
    updates.plan = "free";
    updates.planExpiresAt = null;
  }
  if (avatarUrl !== undefined) {
    if (req.user.avatarUrl) {
      await deleteAvatarByUrl(req.user.avatarUrl);
    }
    if (typeof avatarUrl === "string" && avatarUrl.trim()) {
      if (avatarUrl.startsWith("data:")) {
        const r2Url = await uploadAvatarFromDataUrl(avatarUrl, req.user.id);
        updates.avatarUrl = r2Url || req.user.avatarUrl;
      } else {
        updates.avatarUrl = avatarUrl.trim();
      }
    } else {
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
  await prisma.user.delete({ where: { id: req.user.id } });
  res.status(204).end();
});

export default router;
