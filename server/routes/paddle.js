import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const PADDLE_API_BASE = "https://api.paddle.com";

async function paddleRequest(method, path, body = null) {
  const url = `${PADDLE_API_BASE}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${config.paddle.apiKey}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.detail || data.message || `Paddle API ${res.status}`);
  }
  return data;
}

// Create checkout (transaction) for a plan. Returns checkout URL.
router.post("/create-checkout", requireAuth, async (req, res) => {
  if (!config.paddle.apiKey || !config.paddle.priceIdBasic) {
    return res.status(503).json({ error: "Subscriptions are not configured" });
  }
  const { plan } = req.body; // "basic" | "pro"
  const priceId = plan === "pro" && config.paddle.priceIdPro
    ? config.paddle.priceIdPro
    : config.paddle.priceIdBasic;
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  try {
    const tx = await paddleRequest("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { user_id: req.user.id },
      customer_ip: req.ip || undefined,
    });
    const checkoutUrl = tx.data?.checkout?.url;
    if (!checkoutUrl) {
      return res.status(502).json({ error: "Could not create checkout" });
    }
    res.json({ checkoutUrl, transactionId: tx.data?.id });
  } catch (e) {
    console.error("[paddle] create-checkout", e);
    res.status(502).json({ error: e.message || "Checkout creation failed" });
  }
});

// Paddle webhook: verify signature and handle subscription events
// Note: For exact signature verification, mount this route with express.raw() in server.js
// so req.body is the raw Buffer. Here we accept already-parsed body for simplicity.
router.post("/webhook", async (req, res) => {
  const signature = req.headers["paddle-signature"];
  if (!config.paddle.webhookSecret || !signature) {
    return res.status(400).end();
  }

  const parts = signature.split(";").reduce((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) {
    return res.status(400).end();
  }

  const raw = req.body;
  const bodyStr = Buffer.isBuffer(raw) ? raw.toString("utf8") : (typeof raw === "string" ? raw : JSON.stringify(raw));
  const signed = `${ts}:${bodyStr}`;
  const expected = crypto
    .createHmac("sha256", config.paddle.webhookSecret)
    .update(signed)
    .digest("hex");
  if (expected !== h1) {
    return res.status(401).end();
  }

  const payload = typeof raw === "object" && !Buffer.isBuffer(raw) ? raw : JSON.parse(bodyStr);
  const eventType = payload.event_type;
  const data = payload.data || {};

  try {
    if (eventType === "subscription.created" || eventType === "subscription.activated") {
      const sub = data;
      const customData = sub.custom_data || {};
      const userId = customData.user_id;
      if (userId && sub.id) {
        const plan = (sub.items?.[0]?.price?.product_id || "basic").toString().toLowerCase().includes("pro") ? "pro" : "basic";
        const periodEnd = sub.current_billing_period?.ends_at;
        await prisma.subscription.upsert({
          where: { id: sub.id },
          create: {
            id: sub.id,
            userId,
            paddleSubscriptionId: sub.id,
            paddleCustomerId: sub.customer_id,
            plan,
            status: sub.status || "active",
            currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
          },
          update: {
            plan,
            status: sub.status || "active",
            currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
          },
        });
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            planExpiresAt: periodEnd ? new Date(periodEnd) : null,
          },
        });
      }
    } else if (eventType === "subscription.updated") {
      const sub = data;
      const existing = await prisma.subscription.findFirst({
        where: { id: sub.id },
      });
      if (existing) {
        const periodEnd = sub.current_billing_period?.ends_at;
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            status: sub.status || "active",
            currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
          },
        });
        await prisma.user.update({
          where: { id: existing.userId },
          data: {
            plan: existing.plan,
            planExpiresAt: periodEnd ? new Date(periodEnd) : null,
          },
        });
      }
    } else if (eventType === "subscription.canceled" || eventType === "subscription.past_due") {
      const sub = data;
      const existing = await prisma.subscription.findFirst({
        where: { id: sub.id },
      });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: { status: "cancelled" },
        });
        await prisma.user.update({
          where: { id: existing.userId },
          data: { plan: "free", planExpiresAt: null },
        });
      }
    }
  } catch (e) {
    console.error("[paddle] webhook", eventType, e);
  }

  res.status(200).end();
});

export default router;
