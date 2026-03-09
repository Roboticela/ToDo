import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";

export default function EmailPreferencesPage() {
  const [searchParams] = useSearchParams();
  const unsubscribed = searchParams.get("unsubscribed") === "1";
  const subscribed = searchParams.get("subscribed") === "1";
  const error = searchParams.get("error");

  useEffect(() => {
    document.title = "Email preferences - Roboticela ToDo";
  }, []);

  const getContent = () => {
    if (error === "missing_token") {
      return {
        icon: <AlertCircle className="w-10 h-10 text-amber-400" />,
        title: "Invalid link",
        message: "This link is missing required information. Use the link from your email or manage preferences in Settings.",
      };
    }
    if (error === "invalid_token") {
      return {
        icon: <AlertCircle className="w-10 h-10 text-amber-400" />,
        title: "Link expired or invalid",
        message: "This link may have expired. You can manage your email preferences in Settings when signed in.",
      };
    }
    if (unsubscribed) {
      return {
        icon: <CheckCircle className="w-10 h-10 text-green-400" />,
        title: "You're unsubscribed",
        message: "You won't receive subscription reminder emails. You can turn them back on anytime in Settings.",
      };
    }
    if (subscribed) {
      return {
        icon: <CheckCircle className="w-10 h-10 text-green-400" />,
        title: "You're subscribed",
        message: "You'll receive occasional tips and subscription reminders. You can change this anytime in Settings.",
      };
    }
    return {
      icon: <Mail className="w-10 h-10 text-primary/70" />,
      title: "Email preferences",
      message: "Manage your email preferences from Settings when signed in.",
    };
  };

  const content = getContent();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center shadow-lg"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
          {content.icon}
        </div>
        <h1 className="text-xl font-bold text-foreground">{content.title}</h1>
        <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
          {content.message}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/auth/login"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/todo"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-border text-foreground/80 text-sm font-medium hover:bg-accent/30 transition-colors"
          >
            Go to ToDo
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
