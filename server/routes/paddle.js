import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();
const PADDLE_API_BASE = "https://api.paddle.com";

/** Fallback expiry when Paddle omits billing period end (≈1 billing month). */
function fallbackPeriodEnd(existingEnd) {
  if (existingEnd) return new Date(existingEnd);
  return new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
}

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
    const detail = data.error?.detail ?? data.error?.message ?? data.message;
    const code = data.error?.code;
    if (process.env.NODE_ENV !== "production") {
      console.error("[paddle] API error response", JSON.stringify(data, null, 2));
      if (res.status === 403 || code === "forbidden") {
        console.error("[paddle] Hint: 403 forbidden = API key missing permission. In Paddle Dashboard → Developer tools → Authentication, ensure your API key has **Transactions: Write**.");
      }
    }
    const msg = [detail, code ? `(${code})` : null].filter(Boolean).join(" ") || `Paddle API ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Resolve Paddle price ID from plan and interval. interval: "monthly" | "yearly" (default yearly). plan: "basic" | "pro" | "lifetime"
function getPriceId(plan, interval = "yearly") {
  const p = config.paddle;
  if (plan === "lifetime") return p.priceIdLifetime || null;
  if (plan === "basic") return interval === "monthly" ? p.priceIdBasicMonthly : p.priceIdBasicYearly;
  if (plan === "pro") return interval === "monthly" ? p.priceIdProMonthly : p.priceIdProYearly;
  return null;
}

// Create checkout (transaction) for a plan. Returns checkout URL.
// Body: { plan: "basic" | "pro" | "lifetime", interval?: "monthly" | "yearly" } (default interval: yearly)
router.post("/create-checkout", requireAuth, async (req, res) => {
  if (!config.paddle.apiKey || !config.paddle.priceIdBasicYearly) {
    return res.status(503).json({ error: "Subscriptions are not configured" });
  }
  const { plan, interval } = req.body;
  const billingInterval = interval === "monthly" ? "monthly" : "yearly";
  const priceId = getPriceId(plan, plan === "lifetime" ? "yearly" : billingInterval);
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan or price not configured" });
  }

  // Avoid accidental double subscriptions — manage upgrades via the portal
  const effective = getEffectivePlan(req.user);
  if (effective?.plan === "lifetime") {
    return res.status(409).json({
      error: "You already have a lifetime plan.",
    });
  }

  const now = new Date();
  const blockingSub = await prisma.subscription.findFirst({
    where: {
      userId: req.user.id,
      OR: [
        { status: { in: ["active", "past_due"] } },
        { status: "cancelled", currentPeriodEnd: { gt: now } },
      ],
    },
  });
  if (blockingSub) {
    return res.status(409).json({
      error: "You already have a subscription. Use Manage Subscription to change or cancel it first.",
    });
  }

  try {
    const tx = await paddleRequest("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { user_id: req.user.id, plan: plan || "basic" },
      customer_ip: req.ip || undefined,
    });
    const checkoutUrl = tx.data?.checkout?.url;
    if (!checkoutUrl) {
      return res.status(502).json({ error: "Could not create checkout" });
    }
    res.json({ checkoutUrl, transactionId: tx.data?.id });
  } catch (e) {
    console.error("[paddle] create-checkout", e.message);
    res.status(502).json({ error: e.message || "Checkout creation failed" });
  }
});

/**
 * Paddle webhook handler. Must be mounted with express.raw({ type: "application/json" })
 * so req.body is the raw Buffer for signature verification.
 */
export async function handlePaddleWebhook(req, res) {
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

  // Reject replayed webhooks (Paddle ts is unix seconds)
  const tsSec = Number(ts);
  if (!Number.isFinite(tsSec) || Math.abs(Date.now() / 1000 - tsSec) > 300) {
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
    if (eventType === "transaction.completed") {
      const tx = data;
      const customData = tx.custom_data || {};
      const userId = customData.user_id;
      const planFromData = customData.plan;
      if (userId && planFromData === "lifetime") {
        const isOneTime = !tx.subscription_id;
        if (isOneTime) {
          // Stop recurring billing so lifetime buyers are not charged again
          await cancelActiveSubscriptionsForUser(userId);
          await prisma.user.update({
            where: { id: userId },
            data: { plan: "lifetime", planExpiresAt: null },
          });
        }
      }
    } else if (eventType === "subscription.created" || eventType === "subscription.activated") {
      const sub = data;
      const customData = sub.custom_data || {};
      const userId = customData.user_id;
      if (userId && sub.id) {
        const planFromCustom =
          customData.plan === "pro" || customData.plan === "basic" ? customData.plan : null;
        const priceId = (sub.items?.[0]?.price?.id || "").toString().toLowerCase();
        const productId = (sub.items?.[0]?.price?.product_id || "").toString().toLowerCase();
        const plan =
          planFromCustom ||
          (priceId.includes("pro") || productId.includes("pro") ? "pro" : "basic");
        const periodEnd = sub.current_billing_period?.ends_at;
        const periodEndDate = periodEnd ? new Date(periodEnd) : fallbackPeriodEnd(null);
        await prisma.subscription.upsert({
          where: { id: sub.id },
          create: {
            id: sub.id,
            userId,
            paddleSubscriptionId: sub.id,
            paddleCustomerId: sub.customer_id,
            plan,
            status: sub.status || "active",
            currentPeriodEnd: periodEndDate,
          },
          update: {
            plan,
            status: sub.status || "active",
            currentPeriodEnd: periodEndDate,
          },
        });
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            planExpiresAt: periodEndDate,
          },
        });
      }
    } else if (eventType === "subscription.updated") {
      const sub = data;
      const customData = sub.custom_data || {};
      const userId = customData.user_id;
      const existing = await prisma.subscription.findFirst({
        where: { id: sub.id },
      });
      const planFromCustom =
        customData.plan === "pro" || customData.plan === "basic" ? customData.plan : null;
      const priceId = (sub.items?.[0]?.price?.id || "").toString().toLowerCase();
      const productId = (sub.items?.[0]?.price?.product_id || "").toString().toLowerCase();
      const plan =
        planFromCustom ||
        (priceId.includes("pro") || productId.includes("pro")
          ? "pro"
          : priceId.includes("basic") || productId.includes("basic")
            ? "basic"
            : existing?.plan || "basic");
      const periodEnd = sub.current_billing_period?.ends_at;
      const periodEndDate = periodEnd
        ? new Date(periodEnd)
        : fallbackPeriodEnd(existing?.currentPeriodEnd);
      const ownerId = existing?.userId || userId;
      const rawStatus = (sub.status || existing?.status || "active").toString().toLowerCase();
      const status =
        rawStatus === "canceled" || rawStatus === "cancelled"
          ? "cancelled"
          : rawStatus === "past_due"
            ? "past_due"
            : rawStatus || "active";

      if (ownerId && sub.id) {
        await prisma.subscription.upsert({
          where: { id: sub.id },
          create: {
            id: sub.id,
            userId: ownerId,
            paddleSubscriptionId: sub.id,
            paddleCustomerId: sub.customer_id,
            plan,
            status,
            currentPeriodEnd: periodEndDate,
          },
          update: {
            plan,
            status,
            currentPeriodEnd: periodEndDate,
          },
        });

        if (status === "cancelled") {
          const stillInPaidPeriod = periodEndDate && periodEndDate > new Date();
          if (stillInPaidPeriod) {
            await prisma.user.update({
              where: { id: ownerId },
              data: { plan: existing?.plan || plan, planExpiresAt: periodEndDate },
            });
          } else {
            await prisma.user.update({
              where: { id: ownerId },
              data: { plan: "free", planExpiresAt: null },
            });
          }
        } else if (status === "active" || status === "past_due" || status === "trialing") {
          // Only grant/refresh paid access for healthy subscription states
          await prisma.user.update({
            where: { id: ownerId },
            data: {
              plan,
              planExpiresAt: periodEndDate,
            },
          });
        }
      }
    } else if (eventType === "subscription.canceled" || eventType === "subscription.past_due") {
      const sub = data;
      const existing = await prisma.subscription.findFirst({
        where: { id: sub.id },
      });
      if (existing) {
        const periodEnd =
          sub.current_billing_period?.ends_at ||
          existing.currentPeriodEnd ||
          null;
        const periodEndDate = periodEnd ? new Date(periodEnd) : null;
        const stillInPaidPeriod = periodEndDate && periodEndDate > new Date();

        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            status: eventType === "subscription.past_due" ? "past_due" : "cancelled",
            currentPeriodEnd: periodEndDate,
          },
        });

        if (stillInPaidPeriod) {
          // Keep paid plan until the period they already paid for ends
          await prisma.user.update({
            where: { id: existing.userId },
            data: {
              plan: existing.plan,
              planExpiresAt: periodEndDate,
            },
          });
        } else {
          await prisma.user.update({
            where: { id: existing.userId },
            data: { plan: "free", planExpiresAt: null },
          });
        }
      }
    }
  } catch (e) {
    console.error("[paddle] webhook", eventType, e);
    // Non-2xx so Paddle retries; otherwise plan updates can be lost permanently
    return res.status(500).end();
  }

  res.status(200).end();
}

// Customer portal: get URL so user can manage/cancel subscription
router.post("/portal", requireAuth, async (req, res) => {
  if (!config.paddle.apiKey) {
    return res.status(503).json({ error: "Subscriptions are not configured" });
  }
  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: {
      userId: req.user.id,
      OR: [
        { status: "active" },
        { status: "past_due" },
        { status: "cancelled", currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: { currentPeriodEnd: "desc" },
  });
  const customerId = sub?.paddleCustomerId;
  if (!customerId) {
    return res.status(404).json({ error: "No subscription to manage" });
  }
  try {
    const session = await paddleRequest("POST", `/customers/${customerId}/portal-sessions`, {
      subscription_ids: sub?.id ? [sub.id] : undefined,
    });
    const url = session.data?.urls?.overview ?? session.data?.url ?? session.data?.urls?.customer_portal;
    if (!url) {
      return res.status(502).json({ error: "Could not create portal session" });
    }
    res.json({ url });
  } catch (e) {
    console.error("[paddle] portal", e);
    res.status(502).json({ error: e?.message || "Portal session failed" });
  }
});

/** Cancel all active/past_due Paddle subscriptions for a user (e.g. on account delete).
 *  Returns { ok, failed } — callers should abort account wipe if ok is false and subs existed.
 */
export async function cancelActiveSubscriptionsForUser(userId) {
  if (!config.paddle.apiKey) return { ok: true, failed: 0, attempted: 0 };
  const subs = await prisma.subscription.findMany({
    where: { userId, status: { in: ["active", "past_due"] } },
  });
  let failed = 0;
  for (const sub of subs) {
    const paddleId = sub.paddleSubscriptionId || sub.id;
    try {
      await paddleRequest("POST", `/subscriptions/${paddleId}/cancel`, {
        effective_from: "immediately",
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "cancelled" },
      });
    } catch (e) {
      failed += 1;
      console.error("[paddle] cancel on account delete", paddleId, e?.message || e);
    }
  }
  return { ok: failed === 0, failed, attempted: subs.length };
}

export default router;
