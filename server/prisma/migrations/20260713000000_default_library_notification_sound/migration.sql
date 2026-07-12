-- Default reminders use a library sound (Mixkit "Correct Tone")
ALTER TABLE "User" ALTER COLUMN "notificationSoundMode" SET DEFAULT 'preset';
ALTER TABLE "User" ALTER COLUMN "notificationSoundId" SET DEFAULT 'notify-correct';

-- Existing users still on the old OS-default path get the library default
UPDATE "User"
SET
  "notificationSoundMode" = 'preset',
  "notificationSoundId" = COALESCE(NULLIF("notificationSoundId", ''), 'notify-correct')
WHERE "notificationSoundMode" = 'normal'
  AND ("customSoundUrl" IS NULL OR "customSoundUrl" = '');

UPDATE "User"
SET "notificationSoundId" = 'notify-correct'
WHERE "notificationSoundMode" IN ('preset', 'ringtone')
  AND ("notificationSoundId" IS NULL OR "notificationSoundId" = '');
