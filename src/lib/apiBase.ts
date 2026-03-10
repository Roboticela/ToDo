/**
 * API base URL for backend requests (auth, tasks, etc.).
 * Prefers VITE_API_URL (set at build time). At runtime, if unset and the app
 * is served from app.<domain>, uses api.<domain> so OAuth and API calls work
 * without rebuilding (e.g. app.todo.roboticela.com → api.todo.roboticela.com).
 */
export function getApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.startsWith("https://app.") || origin.startsWith("http://app.")) {
      const scheme = origin.startsWith("https") ? "https" : "http";
      const rest = origin.slice(scheme.length + "://app.".length);
      return `${scheme}://api.${rest}`;
    }
  }
  return "";
}
