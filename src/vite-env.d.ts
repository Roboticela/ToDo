/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL: string
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly TAURI_ENV_PLATFORM?: string
  readonly TAURI_ENV_DEBUG?: string
  readonly TAURI_ENV_ARCH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
