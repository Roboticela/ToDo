/**
 * Re-export useAuth from a hooks-only module so that AuthContext.tsx
 * can export only a React component (AuthProvider), enabling Vite Fast Refresh.
 */
export { useAuth } from "./AuthContext";
