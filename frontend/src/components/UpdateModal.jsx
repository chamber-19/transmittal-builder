/**
 * UpdateModal.jsx — Mandatory update modal.
 *
 * Shown when `check_for_update` returns `{ updateAvailable: true }`.
 * The modal is non-dismissible — the only path forward is Install Now.
 * There is no close button, no ESC-to-close, no backdrop-click dismiss.
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── Design tokens (match App.jsx) ────────────────────────────────────────
const T = {
  bg:     "#15110E",
  bgCard: "#241D18",
  bgIn:   "#2A2218",
  bd:     "#3A2D22",
  t1:     "#F0ECE4",
  t2:     "#A39E93",
  t3:     "#736E64",
  acc:    "#C8823A",
  fB:     "'DM Sans',system-ui,sans-serif",
  fM:     "'JetBrains Mono','SF Mono',monospace",
  r:      "6px",
  rL:     "10px",
};

/**
 * @param {object}   props
 * @param {string}   props.currentVersion   — running version, e.g. "6.0.3"
 * @param {string}   props.availableVersion — remote version, e.g. "6.0.4"
 * @param {string}   props.installerPath    — absolute path to the installer exe
 * @param {string|null} props.notes         — release notes from latest.json
 */
export default function UpdateModal({
  currentVersion,
  availableVersion,
  installerPath,
  notes,
}) {
  const [installing, setInstalling] = useState(false);

  // Block ESC at the document level so the modal cannot be dismissed
  // via keyboard. The handler is attached once on mount and removed on unmount.
  useEffect(() => {
    const blockEsc = (e) => { if (e.key === "Escape") e.preventDefault(); };
    document.addEventListener("keydown", blockEsc, true);
    return () => document.removeEventListener("keydown", blockEsc, true);
  }, []);

  async function handleInstallNow() {
    setInstalling(true);
    try {
      // Invoke start_update which immediately shows the branded updater window
      // and returns once the background install thread is spawned. The main
      // window (and this modal) will be closed by Rust shortly after, so no
      // further UI change is needed here.
      await invoke("start_update", { installerPath, version: availableVersion });
    } catch (e) {
      console.error("[updater] start_update failed:", e);
      setInstalling(false);
    }
  }

  return (
    /* Full-screen backdrop — no onClick handler so clicks do not dismiss
       the modal. ESC is blocked via a document-level keydown listener. */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        fontFamily: T.fB,
      }}
    >
      {/* Card */}
      <div
        style={{
          background: T.bgCard,
          border: `1px solid ${T.bd}`,
          borderRadius: T.rL,
          padding: "32px",
          maxWidth: "440px",
          width: "calc(100% - 48px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {installing ? (
          /* Brief transitional state while the updater window takes over */
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: T.t1,
                marginBottom: "12px",
              }}
            >
              Starting update…
            </div>
          </div>
        ) : (
          /* Update required state */
          <>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: T.t1,
                marginBottom: "8px",
              }}
            >
              Update Required
            </div>
            <div
              style={{
                fontSize: "13px",
                color: T.t2,
                marginBottom: "20px",
                lineHeight: 1.6,
              }}
            >
              A new version of Transmittal Builder is available and must be
              installed before continuing.
            </div>

            {/* Version comparison */}
            <div
              style={{
                background: T.bgIn,
                borderRadius: T.r,
                padding: "12px 16px",
                marginBottom: "20px",
                fontSize: "13px",
                fontFamily: T.fM,
              }}
            >
              <div style={{ color: T.t3, marginBottom: "4px" }}>
                Current:&nbsp;
                <span style={{ color: T.t2 }}>v{currentVersion}</span>
              </div>
              <div style={{ color: T.t3 }}>
                Available:&nbsp;
                <span style={{ color: T.acc, fontWeight: 600 }}>
                  v{availableVersion}
                </span>
              </div>
            </div>

            {/* Release notes (optional) */}
            {notes && (
              <div
                style={{
                  fontSize: "12px",
                  color: T.t3,
                  marginBottom: "20px",
                  lineHeight: 1.6,
                  maxHeight: "80px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {notes}
              </div>
            )}

            <div
              style={{
                fontSize: "12px",
                color: T.t3,
                marginBottom: "24px",
                lineHeight: 1.6,
              }}
            >
              The application will close and the update will install
              automatically. This takes about 30 seconds.
            </div>

            {/* Single mandatory action */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleInstallNow}
                style={{
                  padding: "8px 20px",
                  borderRadius: T.r,
                  border: "none",
                  background: T.acc,
                  color: T.bg,
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: T.fB,
                }}
              >
                Install Now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

