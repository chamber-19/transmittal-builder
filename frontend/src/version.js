/**
 * Single source of truth for the app version inside the React bundle.
 *
 * Build-time: Vite injects __APP_VERSION__ from `package.json` (see
 * frontend/vite.config.js). Runtime fallbacks let the value still resolve
 * when the bundle is loaded outside Vite (e.g. raw browser preview of
 * splash.html), but in production the injected constant always wins.
 *
 * Importers (App.jsx, splash.jsx) should read APP_VERSION from this module
 * instead of hardcoding strings — bumping `frontend/package.json` and
 * `frontend/src-tauri/Cargo.toml` (Tauri/Rust side) is then the only step
 * required to roll a new version.
 */
/* global __APP_VERSION__ */
export const APP_VERSION =
  (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null) ??
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_APP_VERSION : null) ??
  "0.0.0";
