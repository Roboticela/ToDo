/** @type {import('./config.d.ts')} */
export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  appDeepLinkScheme: process.env.APP_DEEP_LINK_SCHEME || "roboticela-todo",

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "change-me-access-secret-min-32-characters",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "change-me-refresh-secret-min-32-characters",
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Roboticela ToDo <noreply@example.com>",
  },

  paddle: {
    apiKey: process.env.PADDLE_API_KEY || "",
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET || "",
    priceIdBasic: process.env.PADDLE_PRICE_ID_BASIC || "",
    priceIdPro: process.env.PADDLE_PRICE_ID_PRO || "",
  },
};
