-- Device-code style desktop OAuth: user must type app-shown code on a fixed URL
DELETE FROM "DesktopPendingAuth";

ALTER TABLE "DesktopPendingAuth" ADD COLUMN "userCode" TEXT NOT NULL;

CREATE UNIQUE INDEX "DesktopPendingAuth_userCode_key" ON "DesktopPendingAuth"("userCode");
