/**
 * API base URL for backend requests (auth, tasks, etc.).
 * Prefers VITE_API_URL (set at build time). At runtime, if unset and the app
 * is served from app.<domain>, uses api.<domain> so OAuth and API calls work
 */
export function getApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL).replace(/\/$/, "");
  return fromEnv;
}
