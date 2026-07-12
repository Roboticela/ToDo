/**
 * Desktop auth is done via backend only: app gets auth URL from backend, opens browser,
 * then polls GET /api/auth/desktop-pending for the code and exchanges it via API.
 * No deep link or paste URL handling.
 */
export default function DeepLinkAuthSetup() {
  return null;
}
