import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read the canonical app version from package.json so the value is never
// stale, regardless of whether `npm_package_version` is set in the env.
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
).version

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ── Tauri-specific overrides ──────────────────────────────────
  // Prevent Vite from hiding Rust compiler errors in the terminal.
  clearScreen: false,

  server: {
    // Tauri expects a fixed port; fail fast if it is already taken.
    port: 1420,
    strictPort: true,
    watch: {
      // Don't watch src-tauri — Cargo has its own watcher.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Expose TAURI_ENV_* variables to the frontend alongside the
  // normal VITE_* prefix so Tauri-injected env vars are accessible.
  envPrefix: ["VITE_", "TAURI_ENV_"],

  // ── Build-time constants ──────────────────────────────────────
  define: {
    // APP_VERSION is read by the splash screen subtitle, the main app footer,
    // and the updater. Sourced from package.json (see PKG_VERSION above) so
    // bumping the version in one place propagates everywhere.
    __APP_VERSION__: JSON.stringify(
      process.env.npm_package_version || PKG_VERSION
    ),
  },

  build: {
    // Tauri uses Chromium on Windows; target it explicitly for an
    // optimal, smaller output bundle.
    target: "chrome111",
    // Emit a source-map in debug builds so Tauri's devtools are useful.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Multi-page: include the updater and splash windows alongside the main app.
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        updater: resolve(__dirname, 'updater.html'),
        splash:  resolve(__dirname, 'splash.html'),
      },
    },
  },
})
