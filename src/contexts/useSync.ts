/**
 * Re-export useSync from a hooks-only module so that SyncContext.tsx
 * can export only a React component (SyncProvider), enabling Vite Fast Refresh.
 */
export { useSync } from "./SyncContext";
