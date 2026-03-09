/** @type {import('./config.d.ts')} */
const port = Number(process.env.PORT) || 3000;
const defaultBackendUrl = `http://localhost:${port}`;

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
  backendUrl: (process.env.BACKEND_URL || defaultBackendUrl).replace(/\/$/, ""),
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

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET || "",
    publicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""),
  },
};
