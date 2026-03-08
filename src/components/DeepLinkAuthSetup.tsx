import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { isTauri } from "../lib/tauri";
import { setupDeepLinkAuth } from "../lib/deepLinkAuth";

/**
 * When running in Tauri, listens for roboticela-todo://auth deep links (e.g. after Google OAuth in system browser)
 * and completes login by saving session and updating auth context.
 */
export default function DeepLinkAuthSetup() {
  const { setAuthData } = useAuth();

  useEffect(() => {
    if (!isTauri()) return;
    const cleanup = setupDeepLinkAuth(setAuthData);
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [setAuthData]);

  return null;
}
