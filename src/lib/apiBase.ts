/**
 * API base URL for backend requests (auth, tasks, etc.).
 * Prefers VITE_API_URL (set at build time). At runtime, if unset and the app
 * is served from app.<domain>, uses api.<domain> so OAuth and API calls work.
 */
export function getApiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (host.startsWith("app.")) {
      return `${window.location.protocol}//api.${host.slice(4)}`;
    }
  }

  return "";
}
