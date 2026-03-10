import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import taskRoutes from "./routes/tasks.js";
import paddleRoutes from "./routes/paddle.js";
import emailRoutes from "./routes/email.js";
import { startSubscriptionReminderJob } from "./jobs/subscriptionReminderJob.js";

// Validate required env vars and log configuration on startup
const REQUIRED_ENV = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
const OPTIONAL_ENV = [
  "FRONTEND_URL", "BACKEND_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "NODE_ENV",
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] FATAL: Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[startup] Environment check:");
[...REQUIRED_ENV, ...OPTIONAL_ENV].forEach((k) => {
  const val = process.env[k];
  console.log(`  ${k}: ${val ? "SET" : "NOT SET (using default)"}`);
});

const app = express();

app.use(
  cors({
    origin: [
      config.frontendUrl,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
    ].filter(Boolean),
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/paddle", paddleRoutes);
app.use("/api/email", emailRoutes);

// Health — includes safe config snapshot to verify env vars in production
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV,
    frontendUrl: config.frontendUrl,
    backendUrl: config.backendUrl,
    db: process.env.DATABASE_URL ? "SET" : "MISSING",
    jwt: process.env.JWT_ACCESS_SECRET ? "SET" : "MISSING",
    google: process.env.GOOGLE_CLIENT_ID ? "SET" : "MISSING",
    smtp: process.env.SMTP_HOST ? "SET" : "MISSING",
    paddle: process.env.PADDLE_API_KEY ? "SET" : "MISSING",
    r2: process.env.R2_ACCOUNT_ID ? "SET" : "MISSING",
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = config.port;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startSubscriptionReminderJob();
});
