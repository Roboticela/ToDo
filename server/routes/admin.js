import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { deleteAvatarByUrl, deleteSoundByUrl } from "../services/r2Service.js";
import { cancelActiveSubscriptionsForUser } from "./paddle.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();
router.use(requireAuth, requireAdmin);

/** Whitelisted Prisma models for the raw table browser. */
const TABLE_META = {
  User: {
    delegate: () => prisma.user,
    idField: "id",
    searchable: ["email", "name", "id"],
    orderBy: { createdAt: "desc" },
    strip: ["passwordHash"],
  },
  Session: {
    delegate: () => prisma.session,
    idField: "id",
    searchable: ["id", "userId"],
    orderBy: { createdAt: "desc" },
  },
  Task: {
    delegate: () => prisma.task,
    idField: "id",
    searchable: ["id", "userId", "title"],
    orderBy: { updatedAt: "desc" },
  },
  TaskCompletion: {
    delegate: () => prisma.taskCompletion,
    idField: "id",
    searchable: ["id", "taskId", "userId", "date"],
    orderBy: { completedAt: "desc" },
  },
  Subscription: {
    delegate: () => prisma.subscription,
    idField: "id",
    searchable: ["id", "userId", "paddleCustomerId", "paddleSubscriptionId"],
    orderBy: { createdAt: "desc" },
  },
  PasswordResetToken: {
    delegate: () => prisma.passwordResetToken,
    idField: "id",
    searchable: ["id", "userId", "token"],
    orderBy: { createdAt: "desc" },
  },
  DesktopAuthCode: {
    delegate: () => prisma.desktopAuthCode,
    idField: "code",
    searchable: ["code", "userId"],
    orderBy: { createdAt: "desc" },
  },
  DesktopPendingAuth: {
    delegate: () => prisma.desktopPendingAuth,
    idField: "requestId",
    searchable: ["requestId", "userCode"],
    orderBy: { createdAt: "desc" },
  },
};

function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function stripSensitive(row, stripKeys = []) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const key of stripKeys) delete out[key];
  // Serialize Dates for JSON
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}

function serializeRow(row, meta) {
  return stripSensitive(row, meta.strip || []);
}

function adminUserListItem(user) {
  const effective = getEffectivePlan(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    plan: user.plan,
    effectivePlan: effective.plan,
    planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : null,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    googleId: user.googleId ?? null,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    counts: user._count
      ? {
          tasks: user._count.tasks,
          sessions: user._count.sessions,
          subscriptions: user._count.subscriptions,
          completions: user._count.completions,
        }
      : undefined,
  };
}

function adminUserDetail(user) {
  const { passwordHash: _ph, ...rest } = user;
  const base = stripSensitive(rest, []);
  const effective = getEffectivePlan(user);
  return {
    ...base,
    hasPassword: Boolean(user.passwordHash),
    effectivePlan: effective.plan,
    counts: user._count
      ? {
          tasks: user._count.tasks,
          sessions: user._count.sessions,
          subscriptions: user._count.subscriptions,
          completions: user._count.completions,
        }
      : undefined,
  };
}

// ─── Overview / tables index ─────────────────────────────────────────────────

router.get("/tables", async (_req, res) => {
  try {
    const tables = [];
    for (const name of Object.keys(TABLE_META)) {
      const count = await TABLE_META[name].delegate().count();
      tables.push({ name, count });
    }
    res.json({ tables });
  } catch (e) {
    console.error("[admin] tables", e);
    res.status(500).json({ error: "Failed to list tables" });
  }
});

// ─── Users (first-class) ─────────────────────────────────────────────────────

router.get("/users", async (req, res) => {
  try {
    const { page, pageSize, skip } = parsePagination(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { id: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { tasks: true, sessions: true, subscriptions: true, completions: true },
          },
        },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      users: rows.map(adminUserListItem),
    });
  } catch (e) {
    console.error("[admin] users list", e);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { tasks: true, sessions: true, subscriptions: true, completions: true },
        },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: adminUserDetail(user) });
  } catch (e) {
    console.error("[admin] user detail", e);
    res.status(500).json({ error: "Failed to load user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own admin account from here." });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const cancelResult = await cancelActiveSubscriptionsForUser(userId);
    if (!cancelResult.ok && cancelResult.attempted > 0) {
      return res.status(502).json({
        error:
          "Could not cancel the user's Paddle subscription. Cancel in Paddle, then retry delete.",
      });
    }
    if (user.avatarUrl) await deleteAvatarByUrl(user.avatarUrl);
    if (user.customSoundUrl) await deleteSoundByUrl(user.customSoundUrl);
    await prisma.user.delete({ where: { id: userId } });
    res.status(204).end();
  } catch (e) {
    console.error("[admin] user delete", e);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ─── Raw table browser ───────────────────────────────────────────────────────

router.get("/tables/:model", async (req, res) => {
  try {
    const meta = TABLE_META[req.params.model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    const { page, pageSize, skip } = parsePagination(req.query);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    let where = {};
    if (q && meta.searchable?.length) {
      where = {
        OR: meta.searchable.map((field) => ({
          [field]: { contains: q, mode: "insensitive" },
        })),
      };
    }

    const delegate = meta.delegate();
    const [total, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: meta.orderBy,
      }),
    ]);

    res.json({
      model: req.params.model,
      idField: meta.idField,
      page,
      pageSize,
      total,
      rows: rows.map((r) => serializeRow(r, meta)),
    });
  } catch (e) {
    console.error("[admin] table list", e);
    res.status(500).json({ error: "Failed to list rows" });
  }
});

router.get("/tables/:model/:id", async (req, res) => {
  try {
    const meta = TABLE_META[req.params.model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    const row = await meta.delegate().findUnique({
      where: { [meta.idField]: req.params.id },
    });
    if (!row) return res.status(404).json({ error: "Record not found" });
    res.json({ model: req.params.model, idField: meta.idField, row: serializeRow(row, meta) });
  } catch (e) {
    console.error("[admin] table get", e);
    res.status(500).json({ error: "Failed to load record" });
  }
});

router.delete("/tables/:model/:id", async (req, res) => {
  try {
    const model = req.params.model;
    const meta = TABLE_META[model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    // Prefer the dedicated user delete path (R2 + Paddle cleanup)
    if (model === "User") {
      return res.status(400).json({
        error: "Delete users via DELETE /api/admin/users/:id so avatars and billing are cleaned up.",
      });
    }

    const id = req.params.id;
    if (model === "User" && id === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own admin account." });
    }

    const existing = await meta.delegate().findUnique({
      where: { [meta.idField]: id },
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });

    await meta.delegate().delete({ where: { [meta.idField]: id } });
    res.status(204).end();
  } catch (e) {
    console.error("[admin] table delete", e);
    res.status(500).json({ error: "Failed to delete record" });
  }
});

export default router;
