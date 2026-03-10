import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Check, Zap, Infinity, ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { type SubscriptionPlan } from "../../types/todo";
import { openLink } from "../../lib/tauri";
import { isTauri } from "../../lib/tauri";
import { getApiBase } from "../../lib/apiBase";


async function createCheckout(plan: "basic" | "pro", accessToken: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/api/paddle/create-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not start checkout");
  }
  const data = await res.json();
  if (!data.checkoutUrl) throw new Error("No checkout URL");
  return data.checkoutUrl;
}

const PLANS: {
  id: SubscriptionPlan;
  name: string;
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  features: string[];
  icon: React.ReactNode;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
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
  },
  {
    id: "basic",
    name: "Basic",
    price: "$2",
    period: "/month",
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
  },
  {
    id: "pro",
    name: "Pro",
    price: "$5",
    period: "/month",
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
  const { user, session } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(plan: SubscriptionPlan) {
    if (plan === "free" || !session?.accessToken) return;
    setError(null);
    setLoadingPlan(plan);
    try {
      const checkoutUrl = await createCheckout(plan, session.accessToken);
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
            Unlock more features to supercharge your productivity
          </p>
        </motion.div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {PLANS.map((plan, i) => {
          const isCurrentPlan = user?.plan === plan.id;
          const isUpgrade = plan.id !== "free" && !isCurrentPlan;
          const isLoading = loadingPlan === plan.id;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className={cn(
                "relative bg-card border rounded-2xl p-5 overflow-hidden flex flex-col lg:flex-1 lg:min-w-0",
                plan.highlight
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-border",
                isCurrentPlan && "ring-2 ring-green-500/30 border-green-500/30"
              )}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                    POPULAR
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
                    plan.highlight ? "bg-primary/15 text-primary" : "bg-accent/40 text-foreground/60"
                  )}
                >
                  {plan.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-foreground/50">{plan.period}</span>
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
                disabled={isCurrentPlan || isLoading}
                onClick={() => isUpgrade && handleUpgrade(plan.id)}
                className={cn(
                  "w-full h-11 rounded-xl text-sm font-semibold transition-all",
                  isCurrentPlan
                    ? "bg-accent/30 text-foreground/40 cursor-default"
                    : plan.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-accent/40 text-foreground hover:bg-accent border border-border"
                )}
              >
                {isCurrentPlan
                  ? "Current Plan"
                  : plan.id === "free"
                  ? "Downgrade to Free"
                  : isLoading
                  ? "Opening checkout..."
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
