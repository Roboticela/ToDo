import { config } from "../config.js";

/** Case-insensitive check against ADMIN_EMAILS allowlist. */
export function isAdminEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return config.adminEmails.includes(normalized);
}
