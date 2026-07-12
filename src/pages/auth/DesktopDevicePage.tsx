import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { getApiBase } from "../../lib/apiBase";
import { cn } from "../../lib/utils";

/**
 * Desktop device-code linking page (opened in the system browser).
 * 1) User signs in with Google
 * 2) User types the code shown in the desktop app
 * 3) App polls and completes login
 */
export default function DesktopDevicePage() {
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState("");
  const [status, setStatus] = useState<"need_google" | "need_code" | "linking" | "done" | "error">(
    "need_google"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Link desktop app - Roboticela ToDo";
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const code = params.get("code");
    if (code) {
      setAuthCode(code);
      setStatus("need_code");
      // Clear hash so the code isn't left in history/referrer
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function startGoogle() {
    const apiBase = getApiBase();
    window.location.href = `${apiBase}/api/auth/google?client=desktop-device`;
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <CheckSquare className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Link desktop app</h1>

        {status === "need_google" && (
          <>
            <p className="text-sm text-foreground/60 mt-2">
              Sign in with Google, then enter the code shown in your ToDo app.
            </p>
            <button
              type="button"
              onClick={startGoogle}
              className="mt-6 w-full h-11 rounded-xl border border-border bg-accent/20 hover:bg-accent/40 text-foreground font-medium text-sm flex items-center justify-center gap-3 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        {(status === "need_code" || status === "linking") && (
          <>
            <p className="text-sm text-foreground/60 mt-2">
              Enter the code displayed in your ToDo app to finish signing in.
            </p>
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-left">
                {error}
              </div>
            )}
            <form onSubmit={handleLink} className="mt-4 space-y-3 text-left">
              <label className="text-sm font-medium text-foreground/80 block">Device code</label>
              <input
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoComplete="one-time-code"
                spellCheck={false}
                className="w-full h-11 px-4 rounded-xl border border-border bg-accent/30 text-foreground text-center tracking-[0.2em] font-mono text-lg placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                disabled={status === "linking"}
                className={cn(
                  "w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm",
                  status === "linking" && "opacity-70 cursor-not-allowed"
                )}
              >
                {status === "linking" ? "Linking…" : "Link and continue"}
              </button>
            </form>
          </>
        )}

        {status === "done" && (
          <p className="text-sm text-foreground/60 mt-2">
            Linked successfully. You can close this tab and return to the ToDo app.
          </p>
        )}
      </div>
    </div>
  );
}
