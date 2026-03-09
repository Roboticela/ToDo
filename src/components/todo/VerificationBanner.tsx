import { useState, useLayoutEffect } from "react";
import { Mail, X } from "lucide-react";

// When banner is visible: move sidebar down so it starts below banner + header (so navbar doesn’t hide it)
const BANNER_HEIGHT = "3.25rem";
const HEADER_HEIGHT = "3.5rem"; // h-14
const SIDEBAR_TOP_WITH_BANNER = `calc(${BANNER_HEIGHT} + ${HEADER_HEIGHT})`; // 6.75rem
const SIDEBAR_TOP_DEFAULT = "3.5rem"; // align with header when no banner
import { useAuth } from "../../contexts/AuthContext";
import { resendVerification } from "../../lib/authService";
import { cn } from "../../lib/utils";

export default function VerificationBanner() {
  const { user, updateUser } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<"success" | "error" | null>(null);

  const visible = user && !user.emailVerifiedAt && !dismissed;

  useLayoutEffect(() => {
    if (visible) {
      document.documentElement.style.setProperty("--sidebar-top", SIDEBAR_TOP_WITH_BANNER);
      return () => {
        document.documentElement.style.setProperty("--sidebar-top", SIDEBAR_TOP_DEFAULT);
      };
    }
    document.documentElement.style.setProperty("--sidebar-top", SIDEBAR_TOP_DEFAULT);
  }, [visible]);

  if (!visible) return null;

  async function handleResend() {
    setMessage(null);
    setResending(true);
    try {
      await resendVerification();
      setMessage("success");
    } catch {
      setMessage("error");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex-shrink-0 w-full border-b border-amber-500/30 bg-amber-500/10">
      <div className="flex items-center justify-between gap-3 w-full px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-foreground/90 truncate">
            Verify your email – we sent a link to <strong>{user.email}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {message === "success" && (
            <span className="text-xs text-green-500">Sent! Check your inbox.</span>
          )}
          {message === "error" && (
            <span className="text-xs text-red-500">Send failed. Try again.</span>
          )}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
              resending
                ? "text-foreground/40 cursor-not-allowed"
                : "text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
            )}
          >
            {resending ? "Sending…" : "Resend link"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1 rounded text-foreground/50 hover:text-foreground hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
