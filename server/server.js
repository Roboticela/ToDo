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

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true });
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
