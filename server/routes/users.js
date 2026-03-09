import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadAvatarFromDataUrl } from "../services/r2Service.js";

const router = Router();

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

router.get("/me", requireAuth, (req, res) => {
  res.json(toUserResponse(req.user));
});

router.patch("/:userId", requireAuth, async (req, res) => {
  if (req.params.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { name, email, avatarUrl } = req.body;
  const updates = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof email === "string" && email.trim()) {
    const existing = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), NOT: { id: req.user.id } },
    });
    if (existing) return res.status(409).json({ error: "Email already in use" });
    updates.email = email.trim().toLowerCase();
  }
  if (avatarUrl !== undefined) {
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
