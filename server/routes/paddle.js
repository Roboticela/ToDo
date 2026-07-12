import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { getEffectivePlan } from "../lib/planUtils.js";

const router = Router();

function paddleApiBase() {
  return config.paddle.sandbox
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

/** Fallback expiry when Paddle omits billing period end (≈1 billing month). */
function fallbackPeriodEnd(existingEnd) {
  if (existingEnd) return new Date(existingEnd);
  return new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
}

function normalizeSubStatus(raw) {
  const s = (raw || "active").toString().toLowerCase();
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "past_due") return "past_due";
  if (s === "paused") return "paused";
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  return s || "active";
}

/** Match against configured Paddle price IDs only — never substring-match `pro_` product ids. */
function configuredPricePlan(priceId) {
  if (!priceId) return null;
  const id = priceId.toString().toLowerCase();
  const p = config.paddle;
  const basic = [p.priceIdBasicMonthly, p.priceIdBasicYearly]
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  const pro = [p.priceIdProMonthly, p.priceIdProYearly]
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  if (pro.includes(id)) return "pro";
  if (basic.includes(id)) return "basic";
  return null;
}

function planFromPriceHints(sub, customData, fallbackPlan) {
  const planFromCustom =
    customData?.plan === "pro" || customData?.plan === "basic" ? customData.plan : null;
  if (planFromCustom) return planFromCustom;
  const fromPrice = configuredPricePlan(sub.items?.[0]?.price?.id);
  if (fromPrice) return fromPrice;
  if (fallbackPlan === "pro" || fallbackPlan === "basic") return fallbackPlan;
  return null;
}

async function userHasLifetime(userId) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return user?.plan === "lifetime";
}

/** Never downgrade or overwrite a lifetime plan from subscription webhooks. */
async function setUserPlanUnlessLifetime(userId, data) {
  if (await userHasLifetime(userId)) return false;
  await prisma.user.update({ where: { id: userId }, data });
  return true;
}

/**
 * Resolve our user id for a Paddle subscription.
 * custom_data on the subscription is often missing — fall back to DB + transaction custom_data.
 */
async function resolveSubscriptionOwner(sub) {
  const customData = sub.custom_data || {};
  if (customData.user_id) {
    return { userId: customData.user_id, planHint: customData.plan || null, customData };
  }

  const existing = await prisma.subscription.findFirst({
    where: { OR: [{ id: sub.id }, { paddleSubscriptionId: sub.id }] },
  });
  if (existing?.userId) {
    return { userId: existing.userId, planHint: existing.plan, customData, existing };
  }

  if (sub.customer_id) {
    const byCustomer = await prisma.subscription.findMany({
      where: { paddleCustomerId: sub.customer_id },
      orderBy: { updatedAt: "desc" },
    });
    const userIds = [...new Set(byCustomer.map((s) => s.userId).filter(Boolean))];
    // Only trust customer_id when it maps to exactly one of our users
    if (userIds.length === 1 && byCustomer[0]) {
      return {
        userId: userIds[0],
        planHint: byCustomer[0].plan,
        customData,
        existing: byCustomer[0],
      };
    }
  }

  // Paddle often keeps user_id only on the originating transaction
  if (sub.id && config.paddle.apiKey) {
    try {
      const txs = await paddleRequest(
        "GET",
        `/transactions?subscription_id=${encodeURIComponent(sub.id)}`
      );
      for (const tx of txs.data || []) {
        const uid = tx.custom_data?.user_id;
        if (uid) {
          return {
            userId: uid,
            planHint: tx.custom_data?.plan || null,
            customData: { ...customData, ...tx.custom_data },
          };
        }
      }
    } catch (e) {
      console.error("[paddle] resolve owner via transactions", e?.message || e);
    }
  }

  return { userId: null, planHint: null, customData, existing: null };
}

async function applyPaidPeriodOrFree(userId, plan, periodEndDate) {
  if (await userHasLifetime(userId)) return;
  const stillInPaidPeriod = periodEndDate && periodEndDate > new Date();
  if (stillInPaidPeriod) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan, planExpiresAt: periodEndDate },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "free", planExpiresAt: null },
    });
  }
}

async function paddleRequest(method, path, body = null) {
  const url = `${paddleApiBase()}${path}`;
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

function isPaddleConfigured() {
  const p = config.paddle;
  return Boolean(
    p.apiKey &&
      (p.priceIdBasicMonthly ||
        p.priceIdBasicYearly ||
        p.priceIdProMonthly ||
        p.priceIdProYearly ||
        p.priceIdLifetime)
  );
}

// Create checkout (transaction) for a plan. Returns checkout URL.
// Body: { plan: "basic" | "pro" | "lifetime", interval?: "monthly" | "yearly" } (default interval: yearly)
router.post("/create-checkout", requireAuth, async (req, res) => {
  if (!isPaddleConfigured()) {
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

  // Lifetime may be bought while a recurring sub exists — webhook cancels it.
  // Basic/Pro still require managing the existing sub first (avoid double billing).
  if (plan !== "lifetime") {
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
  }

  try {
    const tx = await paddleRequest("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: {
        user_id: req.user.id,
        plan: plan || "basic",
        interval: plan === "lifetime" ? "lifetime" : billingInterval,
      },
      customer_ip: (typeof req.ip === "string" && req.ip) || undefined,
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

/** Prefer Paddle billing_period; else existing DB end; else interval-aware fallback. */
function resolvePeriodEndDate(endsAt, existingEnd, intervalHint) {
  if (endsAt) return new Date(endsAt);
  if (existingEnd) return new Date(existingEnd);
  const days = intervalHint === "yearly" ? 370 : 35;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Paddle webhook handler. Must be mounted with express.raw({ type: "application/json" })
 * so req.body is the raw Buffer for signature verification.
 */
export async function handlePaddleWebhook(req, res) {
  const signature = req.headers["paddle-signature"];
  if (!config.paddle.webhookSecret || !signature) {
    return res.status(400).end();
  }

  // Paddle may send multiple h1 values during secret rotation (ts=…;h1=…;h1=…)
  let ts = null;
  const h1Values = [];
  for (const part of String(signature).split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!v) continue;
    if (k === "ts") ts = v;
    else if (k === "h1") h1Values.push(v);
  }
  if (!ts || h1Values.length === 0) {
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
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    if (expectedBuf.length === 0) return res.status(401).end();
    const matched = h1Values.some((h1) => {
      try {
        const h1Buf = Buffer.from(h1, "hex");
        return (
          expectedBuf.length === h1Buf.length &&
          crypto.timingSafeEqual(expectedBuf, h1Buf)
        );
      } catch {
        return false;
      }
    });
    if (!matched) return res.status(401).end();
  } catch {
    return res.status(401).end();
  }

  let payload;
  try {
    payload =
      typeof raw === "object" && !Buffer.isBuffer(raw) ? raw : JSON.parse(bodyStr);
  } catch {
    return res.status(400).end();
  }
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
          // Stop recurring billing so lifetime buyers are not charged again.
          // Fail the webhook (Paddle retries) if cancel fails — otherwise they keep billing.
          const cancelResult = await cancelActiveSubscriptionsForUser(userId);
          if (!cancelResult.ok && cancelResult.attempted > 0) {
            throw new Error(
              `Failed to cancel ${cancelResult.failed}/${cancelResult.attempted} subscription(s) before granting lifetime`
            );
          }
          await prisma.user.update({
            where: { id: userId },
            data: { plan: "lifetime", planExpiresAt: null },
          });
        }
      } else if (
        userId &&
        tx.subscription_id &&
        (planFromData === "basic" || planFromData === "pro")
      ) {
        // Link subscription early from transaction custom_data (often missing on sub webhooks).
        // Do not overwrite a real period end already set by subscription.created/activated.
        // Do not revive cancelled/paused rows from a late/retried transaction.completed.
        const existingSub = await prisma.subscription.findFirst({
          where: {
            OR: [{ id: tx.subscription_id }, { paddleSubscriptionId: tx.subscription_id }],
          },
        });
        const existingStatus = existingSub
          ? normalizeSubStatus(existingSub.status)
          : null;
        const isTerminalSub =
          existingStatus === "cancelled" || existingStatus === "paused";
        const periodEndDate = resolvePeriodEndDate(
          tx.billing_period?.ends_at || existingSub?.currentPeriodEnd,
          null,
          customData.interval
        );
        await prisma.subscription.upsert({
          where: { id: tx.subscription_id },
          create: {
            id: tx.subscription_id,
            userId,
            paddleSubscriptionId: tx.subscription_id,
            paddleCustomerId: tx.customer_id || null,
            plan: planFromData,
            status: "active",
            currentPeriodEnd: periodEndDate,
          },
          update: {
            userId,
            paddleCustomerId: tx.customer_id || undefined,
            plan: planFromData,
            ...(isTerminalSub ? {} : { status: "active" }),
            // leave currentPeriodEnd untouched if subscription.* already set the real ends_at
            ...(existingSub?.currentPeriodEnd
              ? {}
              : { currentPeriodEnd: periodEndDate }),
          },
        });
        const userRow = await prisma.user.findUnique({ where: { id: userId } });
        if (userRow?.plan !== "lifetime" && !isTerminalSub) {
          const planExpiresAt =
            existingSub?.currentPeriodEnd ||
            (userRow?.planExpiresAt && userRow.planExpiresAt > periodEndDate
              ? userRow.planExpiresAt
              : periodEndDate);
          await prisma.user.update({
            where: { id: userId },
            data: { plan: planFromData, planExpiresAt },
          });
        }
      }
    } else if (eventType === "subscription.created" || eventType === "subscription.activated") {
      const sub = data;
      const resolved = await resolveSubscriptionOwner(sub);
      const userId = resolved.userId;
      if (userId && sub.id) {
        const plan = planFromPriceHints(sub, resolved.customData, resolved.planHint);
        if (!plan) {
          console.error("[paddle] subscription event missing plan hint", eventType, sub.id);
        } else {
          const periodEnd = sub.current_billing_period?.ends_at;
          const periodEndDate = periodEnd
            ? new Date(periodEnd)
            : resolvePeriodEndDate(null, null, resolved.customData?.interval);
          await prisma.subscription.upsert({
            where: { id: sub.id },
            create: {
              id: sub.id,
              userId,
              paddleSubscriptionId: sub.id,
              paddleCustomerId: sub.customer_id,
              plan,
              status: normalizeSubStatus(sub.status),
              currentPeriodEnd: periodEndDate,
            },
            update: {
              userId,
              plan,
              status: normalizeSubStatus(sub.status),
              currentPeriodEnd: periodEndDate,
              paddleCustomerId: sub.customer_id || undefined,
            },
          });
          await setUserPlanUnlessLifetime(userId, {
            plan,
            planExpiresAt: periodEndDate,
          });
        }
      } else if (sub.id) {
        console.error("[paddle] subscription event missing user link", eventType, sub.id);
      }
    } else if (eventType === "subscription.updated") {
      const sub = data;
      const resolved = await resolveSubscriptionOwner(sub);
      const existing =
        resolved.existing ||
        (await prisma.subscription.findFirst({
          where: { OR: [{ id: sub.id }, { paddleSubscriptionId: sub.id }] },
        }));
      const plan = planFromPriceHints(sub, resolved.customData, existing?.plan || resolved.planHint);
      if (!plan) {
        console.error("[paddle] subscription.updated missing plan hint", sub.id);
      } else {
        const periodEnd = sub.current_billing_period?.ends_at;
        const periodEndDate = periodEnd
          ? new Date(periodEnd)
          : resolvePeriodEndDate(null, existing?.currentPeriodEnd, resolved.customData?.interval);
        const ownerId = existing?.userId || resolved.userId;
        const status = normalizeSubStatus(sub.status || existing?.status);

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
              paddleCustomerId: sub.customer_id || undefined,
            },
          });

          if (status === "active" || status === "past_due" || status === "trialing") {
            await setUserPlanUnlessLifetime(ownerId, {
              plan,
              planExpiresAt: periodEndDate,
            });
          } else {
            // paused, cancelled, inactive, etc. — honor paid period then free (skips lifetime)
            await applyPaidPeriodOrFree(ownerId, existing?.plan || plan, periodEndDate);
          }
        }
      }
    } else if (eventType === "subscription.canceled" || eventType === "subscription.past_due") {
      const sub = data;
      const existing = await prisma.subscription.findFirst({
        where: { OR: [{ id: sub.id }, { paddleSubscriptionId: sub.id }] },
      });
      if (existing) {
        const periodEnd =
          sub.current_billing_period?.ends_at ||
          existing.currentPeriodEnd ||
          null;
        const periodEndDate = periodEnd ? new Date(periodEnd) : null;
        // Honor remaining paid period; if Paddle omits ends_at, keep ~1 billing month of access
        const gracePeriodEnd =
          periodEndDate || fallbackPeriodEnd(existing.currentPeriodEnd);

        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            status: eventType === "subscription.past_due" ? "past_due" : "cancelled",
            currentPeriodEnd: gracePeriodEnd,
          },
        });

        if (eventType === "subscription.past_due") {
          await setUserPlanUnlessLifetime(existing.userId, {
            plan: existing.plan,
            planExpiresAt: gracePeriodEnd,
          });
        } else {
          await applyPaidPeriodOrFree(existing.userId, existing.plan, gracePeriodEnd);
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
