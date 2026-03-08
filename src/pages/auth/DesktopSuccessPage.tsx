import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare } from "lucide-react";

/**
 * Shown after Google OAuth in the system browser (native app).
 * Displays "Login successful" and tries to open the app via deep link so the desktop app can capture the token.
 * User can also manually return to the app; the app should listen for deep links or poll.
 */
export default function DesktopSuccessPage() {
  const [searchParams] = useSearchParams();
  const [attempted, setAttempted] = useState(false);
  const token = searchParams.get("token");
  const refresh = searchParams.get("refresh");
  const userId = searchParams.get("userId");

  const scheme = "roboticela-todo";
  const deepLink =
    token && userId
      ? `${scheme}://auth?accessToken=${encodeURIComponent(token || "")}&refreshToken=${encodeURIComponent(refresh || "")}&userId=${encodeURIComponent(userId || "")}`
      : null;

  useEffect(() => {
    if (attempted || !deepLink) return;
    setAttempted(true);
    window.location.href = deepLink;
  }, [deepLink, attempted]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <CheckSquare className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Login successful</h1>
        <p className="text-sm text-foreground/60 mt-2">
          You can close this window and return to the ToDo app. If the app did not open automatically, click below.
        </p>
        {deepLink && (
          <a
            href={deepLink}
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Open in ToDo app
          </a>
        )}
      </div>
    </div>
  );
}
