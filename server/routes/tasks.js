import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getEffectivePlan,
  getPlanLimits,
  getHistoryMinDateStr,
  isTaskInHistoryWindow,
} from "../lib/planUtils.js";

const router = Router();

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

/** Next YYYY-MM-DD on/after fromDate that falls on dayOfWeek (0=Sun). */
function nextDateOnWeekday(fromDateStr, dayOfWeek) {
  const d = new Date(fromDateStr + "T12:00:00");
  const delta = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function countTasksOnDate(userId, dateStr, excludeId) {
  const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
  const exclude = excludeId ? { id: { not: excludeId } } : {};
  const oneTimeCount = await prisma.task.count({
    where: {
      userId,
      deletedAt: null,
      date: dateStr,
      isRepeating: false,
      ...exclude,
    },
  });
  const repeatingOnDay = await prisma.task.count({
    where: {
      userId,
      deletedAt: null,
      isRepeating: true,
      date: { lte: dateStr },
      OR: [{ endDate: null }, { endDate: { gte: dateStr } }],
      repeatDays: { has: dayOfWeek },
      ...exclude,
    },
  });
  return oneTimeCount + repeatingOnDay;
}

/** Reject when expanding repeatDays onto weekdays that are already at the daily cap. */
async function wouldExceedDailyCapForRepeatDays(
  userId,
  excludeId,
  repeatDays,
  startDate,
  endDate,
  maxDailyTasks
) {
  if (maxDailyTasks == null || !Array.isArray(repeatDays) || repeatDays.length === 0) {
    return false;
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const fromStr = startDate && startDate > todayStr ? startDate : todayStr;

  for (const dow of repeatDays) {
    if (typeof dow !== "number") continue;
    const sample = nextDateOnWeekday(fromStr, dow);
    if (endDate && sample > endDate) continue;
    const count = await countTasksOnDate(userId, sample, excludeId);
    if (count >= maxDailyTasks) return true;
  }
  return false;
}

function historyWhereClause(minDateStr, dateQuery) {
  if (dateQuery) {
    if (minDateStr && dateQuery < minDateStr) return { __empty: true };
    return { date: dateQuery };
  }
  if (!minDateStr) return {};
  // Keep active repeating templates even when their start date is older than the window
  return {
    OR: [{ isRepeating: true }, { date: { gte: minDateStr } }],
  };
}

// List tasks for user (optionally by date). Enforce plan history window.
router.get("/", requireAuth, async (req, res) => {
  const { date } = req.query;
  const dateQuery = typeof date === "string" ? date : null;
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  const minDateStr = getHistoryMinDateStr(limits.historyDays);
  const historyPart = historyWhereClause(minDateStr, dateQuery);
  if (historyPart.__empty) return res.json([]);

  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id, deletedAt: null, ...historyPart },
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
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  const minDateStr = getHistoryMinDateStr(limits.historyDays);
  if (!isTaskInHistoryWindow(task, minDateStr)) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(taskToJson(task));
});

// Create task. Enforce plan limits (repeat tasks, daily tasks, history).
router.post("/", requireAuth, async (req, res) => {
  const body = req.body;
  if (!body.id || !body.title || !body.type || !body.category || !body.date) {
    return res.status(400).json({ error: "id, title, type, category, date required" });
  }
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  const userId = req.user.id;
  const willBeRepeating = Boolean(body.isRepeating);
  const minDateStr = getHistoryMinDateStr(limits.historyDays);

  if (!willBeRepeating && minDateStr && body.date < minDateStr) {
    return res.status(403).json({
      error: "Date outside plan history window",
      code: "HISTORY_LIMIT",
      limit: limits.historyDays,
    });
  }

  if (willBeRepeating && limits.maxRepeatTasks != null) {
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
    if (!willBeRepeating) {
      const count = await countTasksOnDate(userId, body.date, null);
      if (count >= limits.maxDailyTasks) {
        return res.status(403).json({
          error: "Plan limit reached",
          code: "MAX_DAILY_TASKS",
          limit: limits.maxDailyTasks,
        });
      }
    } else {
      const days = Array.isArray(body.repeatDays) ? body.repeatDays : [];
      if (
        await wouldExceedDailyCapForRepeatDays(
          userId,
          null,
          days,
          body.date,
          body.endDate ?? null,
          limits.maxDailyTasks
        )
      ) {
        return res.status(403).json({
          error: "Plan limit reached",
          code: "MAX_DAILY_TASKS",
          limit: limits.maxDailyTasks,
        });
      }
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
      isRepeating: willBeRepeating,
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
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);
  const softDeleting = data.deletedAt != null;
  if (enablingRepeat) {
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

  const nextDate = data.date !== undefined ? data.date : existing.date;
  const nextRepeating =
    data.isRepeating !== undefined ? Boolean(data.isRepeating) : existing.isRepeating;
  const nextRepeatDays =
    data.repeatDays !== undefined
      ? Array.isArray(data.repeatDays)
        ? data.repeatDays
        : []
      : existing.repeatDays || [];
  const nextEndDate =
    data.endDate !== undefined ? data.endDate : existing.endDate;
  const dateChanged = data.date !== undefined && data.date !== existing.date;
  const repeatDaysChanged =
    data.repeatDays !== undefined &&
    JSON.stringify([...(data.repeatDays || [])].sort()) !==
      JSON.stringify([...(existing.repeatDays || [])].sort());
  const minDateStr = getHistoryMinDateStr(limits.historyDays);

  // Block moving a non-repeating task outside the history window (soft-delete still allowed)
  if (!softDeleting && !nextRepeating && minDateStr && nextDate < minDateStr && dateChanged) {
    return res.status(403).json({
      error: "Date outside plan history window",
      code: "HISTORY_LIMIT",
      limit: limits.historyDays,
    });
  }

  if (limits.maxDailyTasks != null && !nextRepeating && dateChanged) {
    const count = await countTasksOnDate(req.user.id, nextDate, existing.id);
    if (count >= limits.maxDailyTasks) {
      return res.status(403).json({
        error: "Plan limit reached",
        code: "MAX_DAILY_TASKS",
        limit: limits.maxDailyTasks,
      });
    }
  }

  if (
    limits.maxDailyTasks != null &&
    nextRepeating &&
    (enablingRepeat || repeatDaysChanged || dateChanged)
  ) {
    if (
      await wouldExceedDailyCapForRepeatDays(
        req.user.id,
        existing.id,
        nextRepeatDays,
        nextDate,
        nextEndDate,
        limits.maxDailyTasks
      )
    ) {
      return res.status(403).json({
        error: "Plan limit reached",
        code: "MAX_DAILY_TASKS",
        limit: limits.maxDailyTasks,
      });
    }
  }

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data,
  });
  res.json(taskToJson(task));
});

// Delete task (soft-delete to match client sync model)
router.delete("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: "Task not found" });
  await prisma.task.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
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
  const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
  const existing = await prisma.taskCompletion.findUnique({
    where: { taskId_date: { taskId: req.params.taskId, date: body.date } },
  });
  if (existing) {
    if (existing.userId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const comp = await prisma.taskCompletion.update({
      where: { id: existing.id },
      data: { status: body.status, completedAt },
    });
    return res.status(200).json(completionToJson(comp));
  }
  try {
    const comp = await prisma.taskCompletion.create({
      data: {
        id: body.id,
        taskId: req.params.taskId,
        userId: req.user.id,
        date: body.date,
        status: body.status,
        completedAt,
      },
    });
    res.status(201).json(completionToJson(comp));
  } catch (e) {
    if (e?.code === "P2002") {
      const again = await prisma.taskCompletion.findUnique({
        where: { taskId_date: { taskId: req.params.taskId, date: body.date } },
      });
      if (again && again.userId === req.user.id) {
        return res.status(200).json(completionToJson(again));
      }
    }
    throw e;
  }
});

// Sync: bulk upsert tasks and completions (scoped to the authenticated user)
router.post("/sync", requireAuth, async (req, res) => {
  const { tasks = [], completions = [] } = req.body;
  const userId = req.user.id;
  const effective = getEffectivePlan(req.user);
  const limits = getPlanLimits(effective.plan);

  const clientTaskIds = [];
  /** Tasks rejected due to plan limits — returned so the client can keep them locally */
  const rejectedTaskIds = [];
  /** taskId -> client updatedAt ISO (for safe completion prune) */
  const clientTaskUpdatedAt = new Map();
  /** "taskId|date" pairs the client still has */
  const clientCompletionPairs = new Set();

  for (const t of tasks) {
    if (!t.id || !t.title || !t.type || !t.category || !t.date) continue;

    const existing = await prisma.task.findUnique({ where: { id: t.id } });
    if (existing && existing.userId !== userId) {
      // IDOR guard: never let one user overwrite another's task
      continue;
    }

    // Last-write-wins for normal edits; soft-delete still wins over a newer edit
    if (existing && t.updatedAt && existing.updatedAt) {
      const clientTs = new Date(t.updatedAt).getTime();
      const serverTs = new Date(existing.updatedAt).getTime();
      const clientDeleting = Boolean(t.deletedAt);
      const serverDeleted = Boolean(existing.deletedAt);
      if (!Number.isNaN(clientTs) && clientTs < serverTs) {
        // Allow an older client soft-delete to apply (delete wins over concurrent edits)
        if (!(clientDeleting && !serverDeleted)) {
          continue;
        }
      }
    }

    const willBeRepeating = Boolean(t.isRepeating);
    const isNew = !existing;
    const enablingRepeat = willBeRepeating && (!existing || !existing.isRepeating);
    const dateChanged = existing && t.date && t.date !== existing.date;
    const isSoftDelete = Boolean(t.deletedAt);
    const clientRepeatDays = Array.isArray(t.repeatDays) ? t.repeatDays : [];
    const repeatDaysChanged =
      existing &&
      JSON.stringify([...clientRepeatDays].sort()) !==
        JSON.stringify([...(existing.repeatDays || [])].sort());
    const minDateStr = getHistoryMinDateStr(limits.historyDays);

    if (
      !isSoftDelete &&
      !willBeRepeating &&
      minDateStr &&
      t.date < minDateStr &&
      (isNew || dateChanged)
    ) {
      rejectedTaskIds.push(t.id);
      continue;
    }

    if ((isNew && willBeRepeating) || enablingRepeat) {
      if (limits.maxRepeatTasks != null) {
        const repeatCount = await prisma.task.count({
          where: { userId, deletedAt: null, isRepeating: true },
        });
        // Count existing row toward limit only if already repeating
        const alreadyCounted = existing?.isRepeating ? 1 : 0;
        if (repeatCount - alreadyCounted >= limits.maxRepeatTasks) {
          rejectedTaskIds.push(t.id);
          continue;
        }
      }
    }

    if (limits.maxDailyTasks != null && !willBeRepeating && (isNew || dateChanged)) {
      const count = await countTasksOnDate(userId, t.date, existing?.id ?? null);
      if (count >= limits.maxDailyTasks) {
        rejectedTaskIds.push(t.id);
        continue;
      }
    }

    if (
      limits.maxDailyTasks != null &&
      willBeRepeating &&
      !isSoftDelete &&
      (isNew || enablingRepeat || dateChanged || repeatDaysChanged)
    ) {
      if (
        await wouldExceedDailyCapForRepeatDays(
          userId,
          existing?.id ?? null,
          clientRepeatDays,
          t.date,
          t.endDate ?? null,
          limits.maxDailyTasks
        )
      ) {
        rejectedTaskIds.push(t.id);
        continue;
      }
    }

    // Soft-delete is sticky: never clear a server deletedAt unless the client also soft-deleted
    const deletedAtValue = t.deletedAt
      ? new Date(t.deletedAt)
      : existing?.deletedAt
        ? existing.deletedAt
        : null;

    clientTaskIds.push(t.id);
    if (t.updatedAt) clientTaskUpdatedAt.set(t.id, t.updatedAt);
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
        deletedAt: deletedAtValue,
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
        deletedAt: deletedAtValue,
      },
    });
  }

  const clientCompletionIds = [];
  for (const c of completions) {
    if (!c.id || !c.taskId || !c.date || !c.status) continue;
    clientCompletionPairs.add(`${c.taskId}|${c.date}`);

    // Ensure completion belongs to a task owned by this user
    const task = await prisma.task.findFirst({ where: { id: c.taskId, userId } });
    if (!task) continue;

    const clientAt = c.completedAt ? new Date(c.completedAt) : new Date();
    const existingByPair = await prisma.taskCompletion.findUnique({
      where: { taskId_date: { taskId: c.taskId, date: c.date } },
    });

    if (existingByPair) {
      if (existingByPair.userId !== userId) continue;
      // Last-write-wins on completedAt
      if (clientAt.getTime() < existingByPair.completedAt.getTime()) {
        clientCompletionIds.push(existingByPair.id);
        continue;
      }
      await prisma.taskCompletion.update({
        where: { id: existingByPair.id },
        data: {
          status: c.status,
          completedAt: clientAt,
        },
      });
      clientCompletionIds.push(existingByPair.id);
      // Drop orphan row if client used a different id for the same (taskId, date)
      if (c.id !== existingByPair.id) {
        await prisma.taskCompletion.deleteMany({
          where: { id: c.id, userId },
        });
      }
      continue;
    }

    const existingById = await prisma.taskCompletion.findUnique({ where: { id: c.id } });
    if (existingById && existingById.userId !== userId) continue;

    if (existingById) {
      // Same id, different date — treat as move; handle unique collision on (taskId, date)
      if (clientAt.getTime() < existingById.completedAt.getTime() && existingById.date === c.date) {
        clientCompletionIds.push(existingById.id);
        continue;
      }
      const conflict = await prisma.taskCompletion.findUnique({
        where: { taskId_date: { taskId: c.taskId, date: c.date } },
      });
      if (conflict && conflict.id !== c.id) {
        if (conflict.userId !== userId) continue;
        // Keep the newer of the two rows under the conflict id; drop the moving id
        if (clientAt.getTime() >= conflict.completedAt.getTime()) {
          await prisma.taskCompletion.update({
            where: { id: conflict.id },
            data: { status: c.status, completedAt: clientAt },
          });
        }
        await prisma.taskCompletion.deleteMany({ where: { id: c.id, userId } });
        clientCompletionIds.push(conflict.id);
        continue;
      }
      try {
        await prisma.taskCompletion.update({
          where: { id: c.id },
          data: {
            taskId: c.taskId,
            date: c.date,
            status: c.status,
            completedAt: clientAt,
          },
        });
        clientCompletionIds.push(c.id);
      } catch (e) {
        if (e?.code === "P2002") continue;
        throw e;
      }
    } else {
      try {
        await prisma.taskCompletion.create({
          data: {
            id: c.id,
            taskId: c.taskId,
            userId,
            date: c.date,
            status: c.status,
            completedAt: clientAt,
          },
        });
        clientCompletionIds.push(c.id);
      } catch (e) {
        if (e?.code === "P2002") {
          const pair = await prisma.taskCompletion.findUnique({
            where: { taskId_date: { taskId: c.taskId, date: c.date } },
          });
          if (pair) clientCompletionIds.push(pair.id);
          continue;
        }
        throw e;
      }
    }
  }

  // Prune completions only when the client could have known about them.
  // Never delete a server completion newer than the client's task.updatedAt
  // (that completion came from another device after this client's last edit).
  if (clientTaskIds.length > 0) {
    const serverComps = await prisma.taskCompletion.findMany({
      where: { userId, taskId: { in: clientTaskIds } },
    });
    const toDelete = [];
    for (const sc of serverComps) {
      if (clientCompletionIds.includes(sc.id)) continue;
      if (clientCompletionPairs.has(`${sc.taskId}|${sc.date}`)) continue;
      const clientUpdated = clientTaskUpdatedAt.get(sc.taskId);
      if (clientUpdated) {
        const clientTs = new Date(clientUpdated).getTime();
        if (!Number.isNaN(clientTs) && sc.completedAt.getTime() > clientTs) {
          continue; // keep foreign/newer completion
        }
      }
      toDelete.push(sc.id);
    }
    if (toDelete.length > 0) {
      await prisma.taskCompletion.deleteMany({
        where: { userId, id: { in: toDelete } },
      });
    }
  }

  let allTasks = await prisma.task.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });
  let allCompletions = await prisma.taskCompletion.findMany({
    where: { userId },
  });

  // Clamp history for free/basic plans in the sync response (and thus local store)
  const minDateStr = getHistoryMinDateStr(limits.historyDays);
  if (minDateStr) {
    allTasks = allTasks.filter((t) => isTaskInHistoryWindow(t, minDateStr));
    const keptIds = new Set(allTasks.map((t) => t.id));
    allCompletions = allCompletions.filter(
      (c) => c.date >= minDateStr && keptIds.has(c.taskId)
    );
  }

  res.json({
    tasks: allTasks.map(taskToJson),
    completions: allCompletions.map(completionToJson),
    rejectedTaskIds,
  });
});

export default router;
