import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
// Env for production builds is materialized by scripts/sync-frontend-env.mjs
// (Tauri beforeDevCommand / beforeBuildCommand) from process env into .env.*
export default defineConfig(({ mode }) => {
  // Pin env files to this directory so variables load during `vite build` even if cwd differs (e.g. tooling wrappers).
  const envDir = __dirname
  const env = loadEnv(mode, envDir, '')
  const appUrl =
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    env.VITE_APP_URL ||
    env.APP_URL ||
    ''
  const apiUrl =
    process.env.VITE_API_URL ||
    process.env.API_URL ||
    env.VITE_API_URL ||
    env.API_URL ||
    ''
  const googleClientId =
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    env.VITE_GOOGLE_CLIENT_ID ||
    env.GOOGLE_CLIENT_ID ||
    ''

  // Visible in GitHub Actions / CI logs so you can verify what URLs get baked into the client.
  console.log('')
  console.log('========== VITE BUILD ENV (baked into client) ==========')
  console.log(`mode                   = ${mode}`)
  console.log(`TAURI_ENV_PLATFORM     = ${process.env.TAURI_ENV_PLATFORM ?? '(unset)'}`)
  console.log(`TAURI_ENV_DEBUG        = ${process.env.TAURI_ENV_DEBUG ?? '(unset)'}`)
  console.log(`TAURI_ENV_ARCH         = ${process.env.TAURI_ENV_ARCH ?? '(unset)'}`)
  console.log('---------- process.env --------------------------------')
  console.log(`VITE_APP_URL           = ${process.env.VITE_APP_URL ?? '(unset)'}`)
  console.log(`VITE_API_URL           = ${process.env.VITE_API_URL ?? '(unset)'}`)
  console.log(`VITE_GOOGLE_CLIENT_ID  = ${process.env.VITE_GOOGLE_CLIENT_ID ? '(set)' : '(unset)'}`)
  console.log(`APP_URL                = ${process.env.APP_URL ?? '(unset)'}`)
  console.log(`API_URL                = ${process.env.API_URL ?? '(unset)'}`)
  console.log('---------- loadEnv(.env*) ------------------------------')
  console.log(`VITE_APP_URL           = ${env.VITE_APP_URL ?? '(unset)'}`)
  console.log(`VITE_API_URL           = ${env.VITE_API_URL ?? '(unset)'}`)
  console.log(`VITE_GOOGLE_CLIENT_ID  = ${env.VITE_GOOGLE_CLIENT_ID ? '(set)' : '(unset)'}`)
  console.log(`APP_URL                = ${env.APP_URL ?? '(unset)'}`)
  console.log(`API_URL                = ${env.API_URL ?? '(unset)'}`)
  console.log('---------- FINAL (import.meta.env) ---------------------')
  console.log(`VITE_APP_URL           = ${appUrl || '(empty)'}`)
  console.log(`VITE_API_URL           = ${apiUrl || '(empty)'}`)
  console.log(`VITE_GOOGLE_CLIENT_ID  = ${googleClientId ? '(set)' : '(empty)'}`)
  console.log('========================================================')
  console.log('')
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::notice title=Vite baked URLs::VITE_APP_URL=${appUrl || '(empty)'} VITE_API_URL=${apiUrl || '(empty)'} VITE_GOOGLE_CLIENT_ID=${googleClientId ? 'set' : '(empty)'}`)
  }

  return {
    envDir,
    // Expose VITE_* and Tauri CLI hook vars to the client (official Tauri + Vite setup).
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    define: {
      'import.meta.env.VITE_APP_URL': JSON.stringify(appUrl),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
    },
    plugins: [react(), tailwindcss()],

    // Tauri (Android / iOS dev) must reach the Vite process from the device/emulator (e.g. 10.8.0.2:5173).
    // The default (localhost only) will hang with "Waiting for your frontend dev server" on mobile.
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      host: host || '0.0.0.0',
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    build: {
      // Tauri uses Chromium on Windows and WebKit on macOS and Linux.
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: process.env.TAURI_ENV_DEBUG === 'true' ? false : 'esbuild',
      sourcemap: process.env.TAURI_ENV_DEBUG === 'true',
    },
  }
})
