import { CheckSquare } from "lucide-react";

/**
 * Shown after Google OAuth in the system browser (desktop app).
 * The app gets the auth result by polling the backend; this page just tells the user to close the tab.
 */
export default function DesktopSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <CheckSquare className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Login successful</h1>
        <p className="text-sm text-foreground/60 mt-2">
          You can close this tab and return to the ToDo app.
        </p>
      </div>
    </div>
  );
}
