-- Refresh-token grace period (concurrent tab refresh)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "previousRefreshToken" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "previousRefreshValidUntil" TIMESTAMP(3);

-- Persist desktop/web one-time OAuth codes across restarts and instances
CREATE TABLE IF NOT EXISTS "DesktopAuthCode" (
    "code" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesktopAuthCode_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "DesktopPendingAuth" (
    "requestId" TEXT NOT NULL,
    "pollSecret" TEXT NOT NULL,
    "code" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesktopPendingAuth_pkey" PRIMARY KEY ("requestId")
);
