import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { deleteAvatarByUrl, deleteSoundByUrl } from "../services/r2Service.js";
import { cancelActiveSubscriptionsForUser } from "./paddle.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();
router.use(requireAuth, requireAdmin);

/**
 * Field defs for admin CRUD. Types: string | number | boolean | datetime | json | intArray
 * readOnly fields cannot be written; neverReturned are stripped from responses.
 */
const TABLE_META = {
  User: {
    delegate: () => prisma.user,
    idField: "id",
    searchable: ["email", "name", "id"],
    orderBy: { createdAt: "desc" },
    strip: ["passwordHash"],
    neverWrite: ["passwordHash", "createdAt", "updatedAt", "hasPassword", "effectivePlan", "counts"],
    fields: [
      { name: "id", type: "string", readOnly: true },
      { name: "name", type: "string" },
      { name: "email", type: "string" },
      { name: "avatarUrl", type: "string", nullable: true },
      { name: "plan", type: "string" },
      { name: "planExpiresAt", type: "datetime", nullable: true },
      { name: "googleId", type: "string", nullable: true },
      { name: "emailVerifiedAt", type: "datetime", nullable: true },
      { name: "emailVerificationToken", type: "string", nullable: true },
      { name: "emailVerificationTokenExpiresAt", type: "datetime", nullable: true },
      { name: "pendingEmail", type: "string", nullable: true },
      { name: "pendingEmailToken", type: "string", nullable: true },
      { name: "pendingEmailTokenExpiresAt", type: "datetime", nullable: true },
      { name: "subscribedToReminders", type: "boolean" },
      { name: "lastSubscriptionReminderAt", type: "datetime", nullable: true },
      { name: "taskNotificationsEnabled", type: "boolean" },
      { name: "notificationSoundMode", type: "string" },
      { name: "notificationSoundId", type: "string", nullable: true },
      { name: "customSoundUrl", type: "string", nullable: true },
      { name: "createdAt", type: "datetime", readOnly: true },
      { name: "updatedAt", type: "datetime", readOnly: true },
    ],
  },
  Session: {
    delegate: () => prisma.session,
    idField: "id",
    searchable: ["id", "userId"],
    orderBy: { createdAt: "desc" },
    neverWrite: ["createdAt"],
    fields: [
      { name: "id", type: "string" },
      { name: "userId", type: "string" },
      { name: "accessToken", type: "string" },
      { name: "refreshToken", type: "string" },
      { name: "previousRefreshToken", type: "string", nullable: true },
      { name: "previousRefreshValidUntil", type: "datetime", nullable: true },
      { name: "expiresAt", type: "datetime" },
      { name: "createdAt", type: "datetime", readOnly: true },
    ],
  },
  Task: {
    delegate: () => prisma.task,
    idField: "id",
    searchable: ["id", "userId", "title"],
    orderBy: { updatedAt: "desc" },
    neverWrite: ["createdAt", "updatedAt"],
    fields: [
      { name: "id", type: "string" },
      { name: "userId", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string", nullable: true },
      { name: "type", type: "string" },
      { name: "category", type: "string" },
      { name: "priority", type: "string" },
      { name: "date", type: "string" },
      { name: "time", type: "string", nullable: true },
      { name: "startTime", type: "string", nullable: true },
      { name: "endTime", type: "string", nullable: true },
      { name: "isRepeating", type: "boolean" },
      { name: "repeatDays", type: "intArray" },
      { name: "endDate", type: "string", nullable: true },
      { name: "status", type: "string" },
      { name: "completedAt", type: "datetime", nullable: true },
      { name: "createdAt", type: "datetime", readOnly: true },
      { name: "updatedAt", type: "datetime", readOnly: true },
      { name: "deletedAt", type: "datetime", nullable: true },
    ],
  },
  TaskCompletion: {
    delegate: () => prisma.taskCompletion,
    idField: "id",
    searchable: ["id", "taskId", "userId", "date"],
    orderBy: { completedAt: "desc" },
    fields: [
      { name: "id", type: "string" },
      { name: "taskId", type: "string" },
      { name: "userId", type: "string" },
      { name: "date", type: "string" },
      { name: "status", type: "string" },
      { name: "completedAt", type: "datetime" },
    ],
  },
  Subscription: {
    delegate: () => prisma.subscription,
    idField: "id",
    searchable: ["id", "userId", "paddleCustomerId", "paddleSubscriptionId"],
    orderBy: { createdAt: "desc" },
    neverWrite: ["createdAt", "updatedAt"],
    fields: [
      { name: "id", type: "string" },
      { name: "userId", type: "string" },
      { name: "paddleCustomerId", type: "string", nullable: true },
      { name: "paddleSubscriptionId", type: "string", nullable: true },
      { name: "plan", type: "string" },
      { name: "status", type: "string" },
      { name: "currentPeriodEnd", type: "datetime", nullable: true },
      { name: "createdAt", type: "datetime", readOnly: true },
      { name: "updatedAt", type: "datetime", readOnly: true },
    ],
  },
  PasswordResetToken: {
    delegate: () => prisma.passwordResetToken,
    idField: "id",
    searchable: ["id", "userId", "token"],
    orderBy: { createdAt: "desc" },
    neverWrite: ["createdAt"],
    fields: [
      { name: "id", type: "string", readOnly: true },
      { name: "userId", type: "string" },
      { name: "token", type: "string" },
      { name: "expiresAt", type: "datetime" },
      { name: "usedAt", type: "datetime", nullable: true },
      { name: "createdAt", type: "datetime", readOnly: true },
    ],
  },
  DesktopAuthCode: {
    delegate: () => prisma.desktopAuthCode,
    idField: "code",
    searchable: ["code", "userId"],
    orderBy: { createdAt: "desc" },
    neverWrite: ["createdAt"],
    fields: [
      { name: "code", type: "string" },
      { name: "accessToken", type: "string" },
      { name: "refreshToken", type: "string" },
      { name: "userId", type: "string" },
      { name: "expiresAt", type: "datetime" },
      { name: "createdAt", type: "datetime", readOnly: true },
    ],
  },
  DesktopPendingAuth: {
    delegate: () => prisma.desktopPendingAuth,
    idField: "requestId",
    searchable: ["requestId", "userCode"],
    orderBy: { createdAt: "desc" },
    neverWrite: ["createdAt"],
    fields: [
      { name: "requestId", type: "string" },
      { name: "pollSecret", type: "string" },
      { name: "userCode", type: "string" },
      { name: "code", type: "string", nullable: true },
      { name: "expiresAt", type: "datetime" },
      { name: "createdAt", type: "datetime", readOnly: true },
    ],
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
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}

function serializeRow(row, meta) {
  return stripSensitive(row, meta.strip || []);
}

function coerceValue(value, field) {
  if (value === undefined) return { skip: true };
  if (value === null || value === "") {
    if (field.nullable || field.type === "string") {
      return { value: field.type === "string" && value === "" && !field.nullable ? "" : null };
    }
    return { error: `${field.name} cannot be null` };
  }

  switch (field.type) {
    case "string":
      return { value: String(value) };
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) return { error: `${field.name} must be a number` };
      return { value: n };
    }
    case "boolean":
      if (typeof value === "boolean") return { value };
      if (value === "true" || value === "1") return { value: true };
      if (value === "false" || value === "0") return { value: false };
      return { error: `${field.name} must be a boolean` };
    case "datetime": {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return { error: `${field.name} must be a valid datetime` };
      return { value: d };
    }
    case "intArray": {
      let arr = value;
      if (typeof value === "string") {
        try {
          arr = JSON.parse(value);
        } catch {
          return { error: `${field.name} must be a JSON array of integers` };
        }
      }
      if (!Array.isArray(arr) || !arr.every((n) => Number.isInteger(Number(n)))) {
        return { error: `${field.name} must be an array of integers` };
      }
      return { value: arr.map((n) => Number(n)) };
    }
    case "json":
      if (typeof value === "string") {
        try {
          return { value: JSON.parse(value) };
        } catch {
          return { error: `${field.name} must be valid JSON` };
        }
      }
      return { value };
    default:
      return { value };
  }
}

/** Build create/update payload from request body using field schema. */
function buildWriteData(meta, body, { isCreate }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Body must be a JSON object" };
  }
  const data = {};
  const neverWrite = new Set(meta.neverWrite || []);
  const fieldByName = new Map((meta.fields || []).map((f) => [f.name, f]));

  for (const [key, raw] of Object.entries(body)) {
    if (neverWrite.has(key)) continue;
    if (key === "passwordHash") continue;
    const field = fieldByName.get(key);
    if (!field) continue;
    if (field.readOnly && !isCreate) continue;
    if (field.readOnly && isCreate && key !== meta.idField) continue;

    const coerced = coerceValue(raw, field);
    if (coerced.skip) continue;
    if (coerced.error) return { error: coerced.error };
    data[key] = coerced.value;
  }

  return { data };
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

function prismaErrorMessage(e) {
  if (e?.code === "P2002") return "Unique constraint failed (duplicate value).";
  if (e?.code === "P2003") return "Foreign key constraint failed.";
  if (e?.code === "P2025") return "Record not found.";
  return e?.message || "Database write failed";
}

// ─── Overview / tables index ─────────────────────────────────────────────────

router.get("/tables", async (_req, res) => {
  try {
    const tables = [];
    for (const name of Object.keys(TABLE_META)) {
      const meta = TABLE_META[name];
      const count = await meta.delegate().count();
      tables.push({
        name,
        count,
        idField: meta.idField,
        fields: (meta.fields || []).map((f) => ({
          name: f.name,
          type: f.type,
          nullable: Boolean(f.nullable),
          readOnly: Boolean(f.readOnly),
        })),
      });
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
    res.json({
      user: adminUserDetail(user),
      fields: TABLE_META.User.fields,
    });
  } catch (e) {
    console.error("[admin] user detail", e);
    res.status(500).json({ error: "Failed to load user" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const meta = TABLE_META.User;
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const built = buildWriteData(meta, req.body, { isCreate: false });
    if (built.error) return res.status(400).json({ error: built.error });
    if (!Object.keys(built.data).length) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    // Never allow changing email to collide silently — prisma will throw P2002
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: built.data,
      include: {
        _count: {
          select: { tasks: true, sessions: true, subscriptions: true, completions: true },
        },
      },
    });
    res.json({ user: adminUserDetail(user) });
  } catch (e) {
    console.error("[admin] user update", e);
    res.status(400).json({ error: prismaErrorMessage(e) });
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
      fields: meta.fields || [],
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

router.post("/tables/:model", async (req, res) => {
  try {
    const model = req.params.model;
    const meta = TABLE_META[model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    const built = buildWriteData(meta, req.body, { isCreate: true });
    if (built.error) return res.status(400).json({ error: built.error });

    const data = { ...built.data };
    // Auto-generate uuid PK when missing for models that use uuid ids
    if (
      !data[meta.idField] &&
      ["User", "Session", "Task", "TaskCompletion", "PasswordResetToken"].includes(model)
    ) {
      data[meta.idField] = randomUUID();
    }
    if (!data[meta.idField] && model === "Subscription") {
      data[meta.idField] = randomUUID();
    }

    if (!data[meta.idField]) {
      return res.status(400).json({ error: `${meta.idField} is required` });
    }

    const row = await meta.delegate().create({ data });
    res.status(201).json({
      model,
      idField: meta.idField,
      row: serializeRow(row, meta),
    });
  } catch (e) {
    console.error("[admin] table create", e);
    res.status(400).json({ error: prismaErrorMessage(e) });
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
    res.json({
      model: req.params.model,
      idField: meta.idField,
      fields: meta.fields || [],
      row: serializeRow(row, meta),
    });
  } catch (e) {
    console.error("[admin] table get", e);
    res.status(500).json({ error: "Failed to load record" });
  }
});

router.patch("/tables/:model/:id", async (req, res) => {
  try {
    const model = req.params.model;
    const meta = TABLE_META[model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    const existing = await meta.delegate().findUnique({
      where: { [meta.idField]: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const built = buildWriteData(meta, req.body, { isCreate: false });
    if (built.error) return res.status(400).json({ error: built.error });
    // Don't allow changing primary key via patch body
    delete built.data[meta.idField];
    if (!Object.keys(built.data).length) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const row = await meta.delegate().update({
      where: { [meta.idField]: req.params.id },
      data: built.data,
    });
    res.json({
      model,
      idField: meta.idField,
      row: serializeRow(row, meta),
    });
  } catch (e) {
    console.error("[admin] table update", e);
    res.status(400).json({ error: prismaErrorMessage(e) });
  }
});

router.delete("/tables/:model/:id", async (req, res) => {
  try {
    const model = req.params.model;
    const meta = TABLE_META[model];
    if (!meta) return res.status(404).json({ error: "Unknown table" });

    if (model === "User") {
      return res.status(400).json({
        error: "Delete users via DELETE /api/admin/users/:id so avatars and billing are cleaned up.",
      });
    }

    const id = req.params.id;
    const existing = await meta.delegate().findUnique({
      where: { [meta.idField]: id },
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });

    await meta.delegate().delete({ where: { [meta.idField]: id } });
    res.status(204).end();
  } catch (e) {
    console.error("[admin] table delete", e);
    res.status(500).json({ error: prismaErrorMessage(e) });
  }
});

export default router;
