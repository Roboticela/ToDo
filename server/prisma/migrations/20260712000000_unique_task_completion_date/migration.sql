-- Deduplicate completions: keep the newest row per (taskId, date)
DELETE FROM "TaskCompletion" a
USING "TaskCompletion" b
WHERE a."taskId" = b."taskId"
  AND a."date" = b."date"
  AND a."id" <> b."id"
  AND (
    a."completedAt" < b."completedAt"
    OR (a."completedAt" = b."completedAt" AND a."id" < b."id")
  );

CREATE UNIQUE INDEX "TaskCompletion_taskId_date_key" ON "TaskCompletion"("taskId", "date");
