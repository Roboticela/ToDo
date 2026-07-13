import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, CheckSquare, Loader2 } from "lucide-react";
import { getApiBase } from "../../lib/apiBase";
import { cn } from "../../lib/utils";

/**
 * Optional backup linking page.
 * Primary desktop flow opens Google directly and auto-links via requestId.
 * This page is only needed if automatic linking fails and the user enters the backup code.
 */
export default function DesktopDevicePage() {
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState("");
  const [status, setStatus] = useState<"loading" | "need_code" | "linking" | "done" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Link desktop app - ToDo";
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const code = params.get("code");
    if (code) {
      setAuthCode(code);
      setStatus("need_code");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    // No auth code — redirect straight to Google (never show a second Google button).
    const apiBase = getApiBase();
    window.location.replace(`${apiBase}/api/auth/google?client=desktop-device`);
  }, []);

  function formatTypedCode(raw: string) {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (cleaned.length <= 4) return cleaned;
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!authCode) return;
    const trimmed = userCode.trim();
    if (!trimmed) {
      setError("Enter the code shown in the ToDo app.");
      return;
    }
    setError("");
    setStatus("linking");
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/auth/desktop-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: trimmed, code: authCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not link the app. Check the code and try again.");
        setStatus("need_code");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("need_code");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-top relative overflow-hidden">
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
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          {status === "done" ? (
            <Check className="w-8 h-8 text-primary" />
          ) : status === "loading" ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <CheckSquare className="w-8 h-8 text-primary" />
          )}
        </div>

        <h1 className="text-xl font-bold text-foreground">
          {status === "done"
            ? "You're all set"
            : status === "loading"
              ? "Continuing to Google…"
              : "Link desktop app"}
        </h1>

        {status === "loading" && (
          <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
            Redirecting to Google sign-in…
          </p>
        )}

        {(status === "need_code" || status === "linking") && (
          <>
            <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
              Optional backup: enter the code from your ToDo app if automatic linking did not finish.
            </p>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-left"
              >
                {error}
              </motion.div>
            )}
            <form onSubmit={handleLink} className="mt-5 space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground/80 block">
                  Device code (optional backup)
                </label>
                <input
                  value={userCode}
                  onChange={(e) => setUserCode(formatTypedCode(e.target.value))}
                  placeholder="XXXX-XXXX"
                  autoFocus
                  autoComplete="one-time-code"
                  spellCheck={false}
                  disabled={status === "linking"}
                  className="w-full h-14 px-4 rounded-2xl border border-primary/30 bg-primary/5 text-foreground text-center tracking-[0.28em] font-mono text-xl font-bold placeholder:text-foreground/25 placeholder:tracking-[0.28em] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={status === "linking" || userCode.replace(/-/g, "").length < 8}
                className={cn(
                  "w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all",
                  (status === "linking" || userCode.replace(/-/g, "").length < 8) &&
                    "opacity-70 cursor-not-allowed"
                )}
              >
                {status === "linking" ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Linking…
                  </span>
                ) : (
                  "Link and continue"
                )}
              </button>
            </form>
          </>
        )}

        {status === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 space-y-4"
          >
            <p className="text-sm text-foreground/60 leading-relaxed">
              Linked successfully. You can close this tab and return to the ToDo app.
            </p>
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              Sign-in will finish automatically in the desktop app.
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
