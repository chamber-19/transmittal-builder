/**
 * updater.jsx — Branded update progress window.
 *
 * Shown by Rust when the user clicks "Install Now" in the mandatory
 * UpdateModal. This window persists for the duration of the silent NSIS
 * install so the user has clear visual feedback instead of a dead screen.
 *
 * Listens for `updater://status` events emitted by the Rust `start_update`
 * command and updates the displayed phase text. The indeterminate progress
 * bar animates continuously — NSIS silent mode does not emit real progress,
 * so no percentage is available.
 *
 * The user cannot dismiss this window — it is non-interactive by design.
 */

import { useState, useEffect, memo } from "react";
import { createRoot } from "react-dom/client";
import sprocketHammerSvg from "./assets/splash/sprocket-hammer.svg?raw";
import "./updater.css";

// ── Runtime Tauri guard ────────────────────────────────────────────────────
// window.__TAURI_INTERNALS__ is injected by the Tauri webview; absent in any
// plain browser. All IPC calls must be guarded by this flag.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── ForgeIcon: memoized SVG container — never re-renders ──────────────────
const ForgeIcon = memo(function ForgeIcon() {
  return (
    <div
      className="updater-icon"
      dangerouslySetInnerHTML={{ __html: sprocketHammerSvg }}
      aria-hidden="true"
    />
  );
});

// ── Updater component ─────────────────────────────────────────────────────
function Updater() {
  const [status,  setStatus]  = useState("Preparing update\u2026");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!isTauri) return;

    let unlistenStatus;

    const setup = async () => {
      const [{ listen }, { emit }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/event"),
      ]);

      unlistenStatus = await listen("updater://status", (ev) => {
        const { message, version: v } = ev.payload ?? {};
        if (message) setStatus(message);
        if (v)       setVersion(v);
      });

      // Signal Rust that the listener is registered and it is safe to emit
      // updater://status events. Rust waits up to 2 s for this handshake.
      await emit("updater_ready");
    };

    setup().catch(console.error);

    return () => {
      if (unlistenStatus) unlistenStatus();
    };
  }, []);

  return (
    <div className="updater-root">
      {/* Forge icon — same SVG as splash screen */}
      <ForgeIcon />

      {/* Headline */}
      <div className="updater-title">
        {version ? `Updating to v${version}` : "Updating Transmittal Builder"}
      </div>

      {/* Indeterminate progress bar */}
      <div className="updater-progress-track" role="progressbar" aria-label="Update progress">
        <div className="updater-progress-fill" />
      </div>

      {/* Phase status text */}
      <div className="updater-status">{status}</div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Updater />);
