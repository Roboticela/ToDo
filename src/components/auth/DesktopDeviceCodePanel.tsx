import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

type DesktopDeviceCodePanelProps = {
  userCode: string;
  onCancel?: () => void;
  className?: string;
};

export default function DesktopDeviceCodePanel({
  userCode,
  onCancel,
  className,
}: DesktopDeviceCodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showBackupCode, setShowBackupCode] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("text-center space-y-5", className)}
    >
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <div>
          <p className="text-base font-semibold text-foreground">Waiting for Google sign-in</p>
          <p className="mt-1 text-sm text-foreground/55 leading-relaxed">
            Finish signing in with Google in the browser tab. This app will continue automatically.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-accent/20 px-4 py-3">
        <p className="text-xs text-foreground/50 leading-relaxed">
          Keep this window open. You only need to sign in once in the browser.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-medium text-foreground/50 hover:text-foreground/80 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowBackupCode((v) => !v)}
          className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-medium text-primary/80 hover:text-primary transition-colors"
        >
          {showBackupCode ? "Hide backup code" : "Having trouble?"}
        </button>
      </div>

      <AnimatePresence>
        {showBackupCode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-2xl border border-border bg-accent/10 p-4">
              <p className="text-xs text-foreground/55 leading-relaxed">
                Optional: open{" "}
                <span className="font-medium text-foreground/80">/auth/desktop-device</span> and
                enter this code only if automatic linking fails.
              </p>
              <p
                className="font-mono text-xl font-bold tracking-[0.2em] text-foreground select-all"
                aria-label={`Backup device code ${userCode}`}
              >
                {userCode}
              </p>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-background/70 hover:bg-accent/40 text-xs font-medium text-foreground/80 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy code
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
