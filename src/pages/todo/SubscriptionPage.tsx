import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Check, ArrowLeft, Zap, Infinity } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { PLAN_FEATURES, type SubscriptionPlan } from "../../types/todo";
import TodoHeader from "../../components/todo/TodoHeader";

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

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-full">
      <TodoHeader title="Subscription" />

      <div className="flex-1 px-4 py-6 space-y-4 overflow-y-auto custom-scrollbar">
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

        {/* Plan cards */}
        {PLANS.map((plan, i) => {
          const isCurrentPlan = user?.plan === plan.id;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className={cn(
                "relative bg-card border rounded-2xl p-5 overflow-hidden",
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

              <ul className="space-y-2 mb-5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm text-foreground/70">
                    <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={isCurrentPlan}
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
                  : `Upgrade to ${plan.name}`}
              </motion.button>
            </motion.div>
          );
        })}

        {/* Note */}
        <div className="text-center py-2">
          <p className="text-xs text-foreground/30">
            Subscriptions managed securely. Cancel anytime.
          </p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate(-1)}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-border text-sm font-medium text-foreground/60 hover:bg-accent/30 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </motion.button>
      </div>
    </div>
  );
}
