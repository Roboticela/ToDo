/**
 * API base URL for backend requests (auth, tasks, etc.).
 * Prefers VITE_API_URL (set at build time). At runtime, if unset and the app
 * is served from app.<domain>, uses api.<domain> so OAuth and API calls work
 * without rebuilding (e.g. app.todo.roboticela.com → api.todo.roboticela.com).
 */
export function getApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL || "https://api.todo.roboticela.com").replace(/\/$/, "");
  return fromEnv || "https://api.todo.roboticela.com";
}
