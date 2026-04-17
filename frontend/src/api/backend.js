/**
 * backend.js — Resolves the backend base URL at runtime.
 *
 * In development (browser or `tauri dev` without a sidecar), the URL is
 * taken from the VITE_API_URL env var or defaults to http://127.0.0.1:8000.
 *
 * In production (packaged Tauri app with a PyInstaller sidecar), the Rust
 * side picks a free port, spawns the sidecar, and exposes the confirmed URL
 * via the `get_backend_url` Tauri command.  This module calls that command
 * once and caches the result.
 */

const DEFAULT_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

let _cachedUrl = DEFAULT_URL;
let _initPromise = null;

async function _fetchFromTauri() {
  const isTauri =
    typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
  if (!isTauri) return DEFAULT_URL;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke("get_backend_url");
  } catch (e) {
    console.warn("[backend] get_backend_url failed, using default:", DEFAULT_URL, e);
    return DEFAULT_URL;
  }
}

/**
 * Resolve and cache the backend URL.
 * Must be awaited before making API calls in production.
 * Safe to call multiple times — resolves immediately on subsequent calls.
 *
 * @returns {Promise<string>} The base URL, e.g. "http://127.0.0.1:48291"
 */
export async function initBackendUrl() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _cachedUrl = await _fetchFromTauri();
    return _cachedUrl;
  })();
  return _initPromise;
}

/**
 * Force-refresh the backend URL, bypassing the cache. Use during startup
 * retry while the sidecar is still spawning.
 *
 * @returns {Promise<string>} The freshly resolved base URL.
 */
export async function refreshBackendUrl() {
  _cachedUrl = await _fetchFromTauri();
  _initPromise = Promise.resolve(_cachedUrl);
  return _cachedUrl;
}

/**
 * Return the cached backend URL (synchronous).
 * Call `initBackendUrl()` first to ensure this is up-to-date.
 *
 * @returns {string}
 */
export function getBackendUrl() {
  return _cachedUrl;
}
