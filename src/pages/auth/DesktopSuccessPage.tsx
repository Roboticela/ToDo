import { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, CheckSquare } from "lucide-react";

/** Shown after desktop Google OAuth auto-links to the app poll slot. */
export default function DesktopSuccessPage() {
  useEffect(() => {
    document.title = "Signed in - Roboticela ToDo";
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative max-w-sm w-full bg-card border border-border rounded-2xl p-6 text-center shadow-sm"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 relative"
        >
          <CheckSquare className="w-8 h-8 text-primary" />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
            <Check className="w-3.5 h-3.5" />
          </span>
        </motion.div>
        <h1 className="text-xl font-bold text-foreground">You&apos;re all set</h1>
        <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
          Google sign-in completed. You can close this tab and return to the ToDo app.
        </p>
        <div className="mt-5 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Sign-in will finish automatically in the desktop app.
        </div>
      </motion.div>
    </div>
  );
}
