import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

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
