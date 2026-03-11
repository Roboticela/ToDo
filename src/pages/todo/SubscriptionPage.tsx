import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Check, Zap, Infinity, ChevronDown, HelpCircle, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { type SubscriptionPlan, type User } from "../../types/todo";
import { openLink } from "../../lib/tauri";
import { isTauri } from "../../lib/tauri";
import { getApiBase } from "../../lib/apiBase";
import { saveUser } from "../../lib/db";

export type BillingInterval = "monthly" | "yearly";

async function createCheckout(
  plan: "basic" | "pro" | "lifetime",
  accessToken: string,
  interval?: BillingInterval
): Promise<string> {
  const body: { plan: string; interval?: BillingInterval } = { plan };
  if (plan !== "lifetime" && interval) body.interval = interval;
  const res = await fetch(`${getApiBase()}/api/paddle/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not start checkout");
  }
  const data = await res.json();
  if (!data.checkoutUrl) throw new Error("No checkout URL");
  return data.checkoutUrl;
}

async function getPortalUrl(accessToken: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/api/paddle/portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not open subscription management");
  }
  const data = await res.json();
  if (!data.url) throw new Error("No portal URL");
  return data.url;
}

const PLAN_META: {
  id: SubscriptionPlan;
  name: string;
  description: string;
  highlight?: boolean;
  features: string[];
  icon: React.ReactNode;
  /** Price per month when monthly, or per month when yearly (display). Lifetime: one-time. */
  priceMonthly: number;
  priceYearlyPerMonth: number;
  priceLifetime?: number;
}[] = [
  {
    id: "free",
    name: "Free",
    description: "Get started with basic task management",
    features: [
      "2 days of task history",
      "Up to 5 repeat tasks",
      "Up to 10 daily tasks per day",
      "All 3 task types",
      "Do's & Don'ts tracking",
      "Local notifications",
    ],
    icon: <Zap className="w-5 h-5" />,
    priceMonthly: 0,
    priceYearlyPerMonth: 0,
  },
  {
    id: "basic",
    name: "Basic",
    description: "More history and tasks for productive users",
    highlight: true,
    features: [
      "2 weeks of task history",
      "Up to 10 repeat tasks",
      "Up to 15 daily tasks per day",
      "All 3 task types",
      "Do's & Don'ts tracking",
      "Local notifications",
      "Analytics dashboard",
    ],
    icon: <Crown className="w-5 h-5" />,
    priceMonthly: 5,
    priceYearlyPerMonth: 3,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Unlimited everything for power users",
    features: [
      "Unlimited history",
      "Unlimited repeat tasks",
      "Unlimited daily tasks",
      "All 3 task types",
      "Do's & Don'ts tracking",
      "Local notifications",
      "Advanced analytics",
      "Priority support",
    ],
    icon: <Infinity className="w-5 h-5" />,
    priceMonthly: 8,
    priceYearlyPerMonth: 6,
  },
  {
    id: "lifetime",
    name: "Lifetime",
    description: "Pay once, use forever",
    features: [
      "Unlimited history",
      "Unlimited repeat tasks",
      "Unlimited daily tasks",
      "All 3 task types",
      "Do's & Don'ts tracking",
      "Local notifications",
      "Advanced analytics",
      "Priority support",
      "One-time payment",
    ],
    icon: <Infinity className="w-5 h-5" />,
    priceMonthly: 0,
    priceYearlyPerMonth: 0,
    priceLifetime: 79,
  },
];

const FAQ_ITEMS = [
  {
    q: "Can I change or cancel my plan anytime?",
    a: "Yes. You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect at the end of your current billing period.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards through our secure payment provider. Payment is processed securely and we never store your full card details.",
  },
  {
    q: "What happens to my data if I downgrade to Free?",
    a: "Your account and tasks remain. You'll keep access to the Free plan limits: 2 days of history, up to 5 repeat tasks, and up to 10 daily tasks per day. Older history may become read-only.",
  },
  {
    q: "Do you offer refunds?",
    a: "If you're not satisfied, contact us within 14 days of your purchase for a full refund. See our Terms of Service for full details.",
  },
  {
    q: "How does the free trial work?",
    a: "You can use the Free plan indefinitely at no cost. When you upgrade to Basic or Pro, you're charged immediately and can cancel anytime before the next billing date.",
  },
];

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { user, session, updateUser } = useAuth();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("yearly");
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlan | null>(null);
  const [selectingFree, setSelectingFree] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchUser = useCallback(async () => {
    if (!session?.accessToken) return;
    try {
      const res = await fetch(`${getApiBase()}/api/users/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        const updatedUser: User = {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          avatarUrl: userData.avatarUrl,
          plan: userData.plan,
          planExpiresAt: userData.planExpiresAt,
          emailVerifiedAt: userData.emailVerifiedAt,
          subscribedToReminders: userData.subscribedToReminders ?? true,
          createdAt: userData.createdAt,
        };
        await saveUser(updatedUser);
        updateUser(updatedUser);
      }
    } catch {
      // ignore refetch errors
    }
  }, [session?.accessToken, updateUser]);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  useEffect(() => {
    const onFocus = () => refetchUser();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetchUser]);

  async function handleSelectFree() {
    if (!user?.id || !session?.accessToken) return;
    setError(null);
    setSelectingFree(true);
    try {
      const res = await fetch(`${getApiBase()}/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ plan: "free" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not select Free plan");
      }
      await refetchUser();
      navigate("/todo", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not select Free plan");
    } finally {
      setSelectingFree(false);
    }
  }

  async function handleUpgrade(plan: SubscriptionPlan) {
    if (plan === "free" || !session?.accessToken) return;
    setError(null);
    setLoadingPlan(plan);
    try {
      const checkoutUrl =
        plan === "lifetime"
          ? await createCheckout("lifetime", session.accessToken)
          : await createCheckout(plan as "basic" | "pro", session.accessToken, billingInterval);
      if (isTauri()) {
        await openLink(checkoutUrl, { openInNewTab: true });
      } else {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleManageSubscription() {
    if (!session?.accessToken || (user?.plan !== "basic" && user?.plan !== "pro")) return;
    setError(null);
    setPortalLoading(true);
    try {
      const url = await getPortalUrl(session.accessToken);
      if (isTauri()) {
        await openLink(url, { openInNewTab: true });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open subscription management");
    } finally {
      setPortalLoading(false);
    }
  }

  const canManageSubscription = user?.plan === "basic" || user?.plan === "pro";
  const isPaidPlan = (p: SubscriptionPlan) => p === "basic" || p === "pro" || p === "lifetime";

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-4 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center pb-2"
        >
          <h2 className="text-xl font-bold text-foreground">Choose Your Plan</h2>
          <p className="text-sm text-foreground/50 mt-1">
            {user?.plan === "pending"
              ? "Choose a plan to get started"
              : "Unlock more features to supercharge your productivity"}
          </p>
        </motion.div>

        {canManageSubscription && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent/40 text-foreground hover:bg-accent border border-border disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
              {portalLoading ? "Opening..." : "Manage subscription"}
            </button>
          </motion.div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Billing toggle: Yearly (default) / Monthly - only for Basic & Pro */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center gap-1 p-2 rounded-xl bg-accent/20 border border-border w-fit mx-auto"
        >
          <button
            type="button"
            onClick={() => setBillingInterval("yearly")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              billingInterval === "yearly"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            Yearly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              billingInterval === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            Monthly
          </button>
        </motion.div>

        {/* Plan cards */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch flex-wrap justify-center">
        {PLAN_META.map((plan, i) => {
          const isCurrentPlan = user?.plan === plan.id;
          const isPendingSelectFree = plan.id === "free" && user?.plan === "pending";
          const isUpgrade = isPaidPlan(plan.id) && !isCurrentPlan;
          const isLoading = loadingPlan === plan.id;
          const isSelectingFree = plan.id === "free" && selectingFree;
          const isLifetime = plan.id === "lifetime";
          const priceLabel =
            plan.id === "free"
              ? "$0"
              : isLifetime && plan.priceLifetime != null
              ? `$${plan.priceLifetime}`
              : billingInterval === "yearly"
              ? `$${plan.priceYearlyPerMonth}`
              : `$${plan.priceMonthly}`;
          const periodLabel =
            plan.id === "free"
              ? "forever"
              : isLifetime
              ? "one-time"
              : billingInterval === "yearly"
              ? "/mo, billed yearly"
              : "/month";
          const savePct =
            !isLifetime && plan.id !== "free" && billingInterval === "yearly" && plan.priceMonthly > 0
              ? Math.round((1 - plan.priceYearlyPerMonth / plan.priceMonthly) * 100)
              : 0;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className={cn(
                "relative bg-card border rounded-2xl p-5 overflow-hidden flex flex-col lg:flex-1 lg:min-w-0 min-w-[260px] max-w-[320px]",
                plan.highlight
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-border",
                isCurrentPlan && "ring-2 ring-green-500/30 border-green-500/30"
              )}
            >
              {plan.highlight && !isLifetime && (
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                    POPULAR
                  </div>
                </div>
              )}
              {isLifetime && (
                <div className="absolute top-0 right-0">
                  <div className="bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                    BEST VALUE
                  </div>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute top-0 left-0">
                  <div className="bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-br-xl">
                    CURRENT
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 mb-4">
                <div
                  className={cn(
                    "p-2.5 rounded-xl",
                    plan.highlight || isLifetime ? "bg-primary/15 text-primary" : "bg-accent/40 text-foreground/60"
                  )}
                >
                  {plan.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-2xl font-bold text-foreground">{priceLabel}</span>
                    <span className="text-sm text-foreground/50">{periodLabel}</span>
                    {savePct > 0 && (
                      <span className="text-xs text-green-500 font-medium ml-1">Save {savePct}%</span>
                    )}
                  </div>
                  <p className="text-base font-semibold text-foreground">{plan.name}</p>
                  <p className="text-xs text-foreground/50 mt-0.5">{plan.description}</p>
                </div>
              </div>

              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-foreground/70">
                    <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={isCurrentPlan || isLoading || isSelectingFree}
                onClick={() => {
                  if (isPendingSelectFree) handleSelectFree();
                  else if (isUpgrade) handleUpgrade(plan.id);
                }}
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-semibold transition-all",
                  isCurrentPlan
                    ? "bg-accent/30 text-foreground/40 cursor-default"
                    : plan.highlight || isLifetime
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-accent/40 text-foreground hover:bg-accent border border-border"
                )}
              >
                {isCurrentPlan
                  ? "Current Plan"
                  : isPendingSelectFree
                  ? isSelectingFree
                    ? "Selecting..."
                    : "Choose Free"
                  : plan.id === "free"
                  ? "Downgrade to Free"
                  : isLoading
                  ? "Opening checkout..."
                  : isLifetime
                  ? "Get Lifetime"
                  : `Upgrade to ${plan.name}`}
              </motion.button>
            </motion.div>
          );
        })}
        </div>

        {/* Note */}
        <div className="text-center py-2">
          <p className="text-xs text-foreground/30">
            Subscriptions managed securely. Cancel anytime.
          </p>
        </div>

        {/* FAQ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="pt-8 pb-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-5 h-5 text-foreground/60" />
            <h3 className="text-lg font-semibold text-foreground">Frequently Asked Questions</h3>
          </div>
          <ul className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={i} question={item.q} answer={item.a} index={i} />
            ))}
          </ul>
        </motion.section>
      </div>
    </div>
  );
}

function FAQItem({
  question,
  answer,
  index,
}: {
  question: string;
  answer: string;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{question}</span>
        <ChevronDown
          className={cn("w-4 h-4 shrink-0 text-foreground/50 transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <p className="px-4 py-3 text-sm text-foreground/70 leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
