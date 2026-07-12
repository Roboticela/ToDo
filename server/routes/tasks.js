import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEffectivePlan, getPlanLimits } from "../lib/planUtils.js";

const router = Router();
const PLAN_VALUES = ["free", "basic", "pro"];

function taskToJson(t) {
  return {
    id: t.id,
    userId: t.userId,
    title: t.title,
    description: t.description ?? undefined,
    type: t.type,
    category: t.category,
    priority: t.priority ?? "medium",
    date: t.date,
    time: t.time ?? undefined,
    startTime: t.startTime ?? undefined,
    endTime: t.endTime ?? undefined,
    isRepeating: t.isRepeating,
    repeatDays: t.repeatDays,
    endDate: t.endDate ?? undefined,
    status: t.status,
    completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
    syncStatus: "synced",
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : undefined,
  };
}

function completionToJson(c) {
  return {
    id: c.id,
    taskId: c.taskId,
    userId: c.userId,
    date: c.date,
    status: c.status,
    completedAt: c.completedAt.toISOString(),
    syncStatus: "synced",
  };
}

// List tasks for user (optionally by date). Enforce plan history window.
router.get("/", requireAuth, async (req, res) => {
  const { date } = req.query;
  const where = { userId: req.user.id, deletedAt: null };
  if (date && typeof date === "string") where.date = date;
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  if (limits.historyDays != null) {
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() - (limits.historyDays - 1));
    const y = minDate.getFullYear();
    const m = String(minDate.getMonth() + 1).padStart(2, "0");
    const d = String(minDate.getDate()).padStart(2, "0");
    const minDateStr = `${y}-${m}-${d}`;
    if (where.date) {
      if (where.date < minDateStr) return res.json([]);
    } else {
      where.date = { gte: minDateStr };
    }
  }
  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });
  res.json(tasks.map(taskToJson));
});

// Get single task
router.get("/:id", requireAuth, async (req, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(taskToJson(task));
});

// Create task. Enforce plan limits (repeat tasks, daily tasks).
router.post("/", requireAuth, async (req, res) => {
  const body = req.body;
  if (!body.id || !body.title || !body.type || !body.category || !body.date) {
    return res.status(400).json({ error: "id, title, type, category, date required" });
  }
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  const userId = req.user.id;

  if (Boolean(body.isRepeating) && limits.maxRepeatTasks != null) {
    const repeatCount = await prisma.task.count({
      where: { userId, deletedAt: null, isRepeating: true },
    });
    if (repeatCount >= limits.maxRepeatTasks) {
      return res.status(403).json({
        error: "Plan limit reached",
        code: "MAX_REPEAT_TASKS",
        limit: limits.maxRepeatTasks,
      });
    }
  }
  if (limits.maxDailyTasks != null) {
    const dayOfWeek = new Date(body.date + "T12:00:00").getDay();
    const oneTimeCount = await prisma.task.count({
      where: { userId, deletedAt: null, date: body.date, isRepeating: false },
    });
    const repeatingOnDay = await prisma.task.count({
      where: {
        userId,
        deletedAt: null,
        isRepeating: true,
        date: { lte: body.date },
        OR: [{ endDate: null }, { endDate: { gte: body.date } }],
        repeatDays: { has: dayOfWeek },
      },
    });
    if (oneTimeCount + repeatingOnDay >= limits.maxDailyTasks) {
      return res.status(403).json({
        error: "Plan limit reached",
        code: "MAX_DAILY_TASKS",
        limit: limits.maxDailyTasks,
      });
    }
  }

  const task = await prisma.task.create({
    data: {
      id: body.id,
      userId: req.user.id,
      title: body.title,
      description: body.description ?? null,
      type: body.type,
      category: body.category,
      priority: body.priority ?? "medium",
      date: body.date,
      time: body.time ?? null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      isRepeating: Boolean(body.isRepeating),
      repeatDays: Array.isArray(body.repeatDays) ? body.repeatDays : [],
      endDate: body.endDate ?? null,
      status: body.status || "pending",
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
    },
  });
  res.status(201).json(taskToJson(task));
});

// Update task
router.patch("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const body = req.body;
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.type !== undefined) data.type = body.type;
  if (body.category !== undefined) data.category = body.category;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.date !== undefined) data.date = body.date;
  if (body.time !== undefined) data.time = body.time;
  if (body.startTime !== undefined) data.startTime = body.startTime;
  if (body.endTime !== undefined) data.endTime = body.endTime;
  if (body.isRepeating !== undefined) data.isRepeating = body.isRepeating;
  if (body.repeatDays !== undefined) data.repeatDays = body.repeatDays;
  if (body.endDate !== undefined) data.endDate = body.endDate;
  if (body.status !== undefined) data.status = body.status;
  if (body.completedAt !== undefined) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
  if (body.deletedAt !== undefined) data.deletedAt = body.deletedAt ? new Date(body.deletedAt) : null;

  const enablingRepeat =
    data.isRepeating === true && !existing.isRepeating;
  if (enablingRepeat) {
    const effective = getEffectivePlan(req.user);
    const limits = getPlanLimits(effective.plan);
    if (limits.maxRepeatTasks != null) {
      const repeatCount = await prisma.task.count({
        where: { userId: req.user.id, deletedAt: null, isRepeating: true },
      });
      if (repeatCount >= limits.maxRepeatTasks) {
        return res.status(403).json({
          error: "Plan limit reached",
          code: "MAX_REPEAT_TASKS",
          limit: limits.maxRepeatTasks,
        });
      }
    }
  }

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data,
  });
  res.json(taskToJson(task));
});

// Delete task (hard or soft)
router.delete("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: "Task not found" });
  await prisma.taskCompletion.deleteMany({ where: { taskId: req.params.id } });
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Completions ───────────────────────────────────────────────────────────────

router.get("/:taskId/completions", requireAuth, async (req, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.taskId, userId: req.user.id },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  const list = await prisma.taskCompletion.findMany({
    where: { taskId: req.params.taskId },
  });
  res.json(list.map(completionToJson));
});

router.post("/:taskId/completions", requireAuth, async (req, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.taskId, userId: req.user.id },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  const body = req.body;
  if (!body.id || !body.date || !body.status) {
    return res.status(400).json({ error: "id, date, status required" });
  }
  const comp = await prisma.taskCompletion.create({
    data: {
      id: body.id,
      taskId: req.params.taskId,
      userId: req.user.id,
      date: body.date,
      status: body.status,
      completedAt: body.completedAt ? new Date(body.completedAt) : new Date(),
    },
  });
  res.status(201).json(completionToJson(comp));
});

// Sync: bulk upsert tasks and completions (scoped to the authenticated user)
router.post("/sync", requireAuth, async (req, res) => {
  const { tasks = [], completions = [] } = req.body;
  const userId = req.user.id;
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);

  const clientTaskIds = [];

  for (const t of tasks) {
    if (!t.id || !t.title || !t.type || !t.category || !t.date) continue;

    const existing = await prisma.task.findUnique({ where: { id: t.id } });
    if (existing && existing.userId !== userId) {
      // IDOR guard: never let one user overwrite another's task
      continue;
    }

    // Last-write-wins: skip stale client updates
    if (existing && t.updatedAt && existing.updatedAt) {
      const clientTs = new Date(t.updatedAt).getTime();
      const serverTs = new Date(existing.updatedAt).getTime();
      if (!Number.isNaN(clientTs) && clientTs < serverTs) {
        clientTaskIds.push(t.id);
        continue;
      }
    }

    const willBeRepeating = Boolean(t.isRepeating);
    const isNew = !existing;
    const enablingRepeat = willBeRepeating && (!existing || !existing.isRepeating);

    if ((isNew && willBeRepeating) || enablingRepeat) {
      if (limits.maxRepeatTasks != null) {
        const repeatCount = await prisma.task.count({
          where: { userId, deletedAt: null, isRepeating: true },
        });
        // Count existing row toward limit only if already repeating
        const alreadyCounted = existing?.isRepeating ? 1 : 0;
        if (repeatCount - alreadyCounted >= limits.maxRepeatTasks) {
          continue;
        }
      }
    }

    if (isNew && limits.maxDailyTasks != null && !willBeRepeating) {
      const dayOfWeek = new Date(t.date + "T12:00:00").getDay();
      const oneTimeCount = await prisma.task.count({
        where: { userId, deletedAt: null, date: t.date, isRepeating: false },
      });
      const repeatingOnDay = await prisma.task.count({
        where: {
          userId,
          deletedAt: null,
          isRepeating: true,
          date: { lte: t.date },
          OR: [{ endDate: null }, { endDate: { gte: t.date } }],
          repeatDays: { has: dayOfWeek },
        },
      });
      if (oneTimeCount + repeatingOnDay >= limits.maxDailyTasks) {
        continue;
      }
    }

    clientTaskIds.push(t.id);
    await prisma.task.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        userId,
        title: t.title,
        description: t.description ?? null,
        type: t.type,
        category: t.category,
        priority: t.priority ?? "medium",
        date: t.date,
        time: t.time ?? null,
        startTime: t.startTime ?? null,
        endTime: t.endTime ?? null,
        isRepeating: willBeRepeating,
        repeatDays: Array.isArray(t.repeatDays) ? t.repeatDays : [],
        endDate: t.endDate ?? null,
        status: t.status || "pending",
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        deletedAt: t.deletedAt ? new Date(t.deletedAt) : null,
      },
      update: {
        title: t.title,
        description: t.description ?? null,
        type: t.type,
        category: t.category,
        priority: t.priority ?? "medium",
        date: t.date,
        time: t.time ?? null,
        startTime: t.startTime ?? null,
        endTime: t.endTime ?? null,
        isRepeating: willBeRepeating,
        repeatDays: Array.isArray(t.repeatDays) ? t.repeatDays : [],
        endDate: t.endDate ?? null,
        status: t.status || "pending",
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        deletedAt: t.deletedAt ? new Date(t.deletedAt) : null,
      },
    });
  }

  const clientCompletionIds = [];
  for (const c of completions) {
    if (!c.id || !c.taskId || !c.date || !c.status) continue;

    const existingComp = await prisma.taskCompletion.findUnique({ where: { id: c.id } });
    if (existingComp && existingComp.userId !== userId) continue;

    // Ensure completion belongs to a task owned by this user
    const task = await prisma.task.findFirst({ where: { id: c.taskId, userId } });
    if (!task) continue;

    clientCompletionIds.push(c.id);
    await prisma.taskCompletion.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        taskId: c.taskId,
        userId,
        date: c.date,
        status: c.status,
        completedAt: c.completedAt ? new Date(c.completedAt) : new Date(),
      },
      update: {
        date: c.date,
        status: c.status,
        completedAt: c.completedAt ? new Date(c.completedAt) : undefined,
      },
    });
  }

  // Prune completions only for tasks the client actually sent.
  // Empty local DB (fresh device) sends no tasks → skip delete → server data is returned intact.
  if (clientTaskIds.length > 0) {
    await prisma.taskCompletion.deleteMany({
      where: {
        userId,
        taskId: { in: clientTaskIds },
        ...(clientCompletionIds.length > 0
          ? { id: { notIn: clientCompletionIds } }
          : {}),
      },
    });
  }

  let allTasks = await prisma.task.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });
  let allCompletions = await prisma.taskCompletion.findMany({
    where: { userId },
  });

  // Clamp history for free/basic plans in the sync response (and thus local store)
  if (limits.historyDays != null) {
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() - (limits.historyDays - 1));
    const y = minDate.getFullYear();
    const m = String(minDate.getMonth() + 1).padStart(2, "0");
    const d = String(minDate.getDate()).padStart(2, "0");
    const minDateStr = `${y}-${m}-${d}`;
    allTasks = allTasks.filter((t) => t.isRepeating || t.date >= minDateStr);
    const keptIds = new Set(allTasks.map((t) => t.id));
    allCompletions = allCompletions.filter(
      (c) => c.date >= minDateStr && keptIds.has(c.taskId)
    );
  }

  res.json({
    tasks: allTasks.map(taskToJson),
    completions: allCompletions.map(completionToJson),
  });
});

export default router;
