/**
 * updater.jsx — Force-update progress window.
 *
 * Shown by Rust when an update is available on the shared drive.
 * Listens for `update_info` (once) and `update_progress` events emitted
 * by the Rust updater module and displays a branded progress bar while the
 * installer is copied from the shared drive to %TEMP%.
 *
 * The user cannot cancel — this is intentional per the product spec.
 */

import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";

// ── Design tokens (mirrors App.jsx) ─────────────────────────────────────
const T = {
  bg:   "#121212",
  bgEl: "#1e1e1e",
  bgIn: "#171717",
  bd:   "rgba(255,255,255,0.08)",
  t1:   "#f0f0f0",
  t2:   "#a0a0a0",
  t3:   "#606060",
  acc:  "#C8823A",
  ok:   "#6b9e6b",
  fM:   "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fD:   "'Inter', system-ui, sans-serif",
};

// ── Updater component ────────────────────────────────────────────────────
function Updater() {
  const [version, setVersion]   = useState("");
  const [notes, setNotes]       = useState(null);
  const [percent, setPercent]   = useState(0);
  const [status, setStatus]     = useState("Preparing update…");

  useEffect(() => {
    // Receive version / notes from Rust before copy starts.
    const unlisten1 = listen("update_info", (ev) => {
      setVersion(ev.payload?.version ?? "");
      setNotes(ev.payload?.notes ?? null);
      setStatus(`Downloading update to v${ev.payload?.version ?? "…"}…`);
    });

    // Receive copy progress events.
    const unlisten2 = listen("update_progress", (ev) => {
      const p = ev.payload?.percent ?? 0;
      setPercent(p);
      if (p >= 100) {
        setStatus("Launching installer…");
      }
    });

    // Signal Rust that both listeners are registered and it is safe to
    // start emitting update_info / update_progress events.
    Promise.all([unlisten1, unlisten2]).then(() => {
      emit("updater_ready");
    });

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: T.fD,
        background: T.bg,
        color: T.t1,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        userSelect: "none",
        padding: "32px",
        boxSizing: "border-box",
      }}
    >
      {/* Logo / brand mark */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "10px",
          background: `linear-gradient(135deg,${T.acc},#A06830)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: T.fM,
          fontWeight: 700,
          fontSize: "14px",
          letterSpacing: "-0.02em",
          flexShrink: 0,
        }}
      >
        R3P
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "18px", fontWeight: 600, color: T.t1, marginBottom: "4px" }}>
          {version ? `Updating to v${version}` : "Updating Transmittal Builder…"}
        </div>
        <div style={{ fontSize: "12px", color: T.t2 }}>
          Please wait. Do not close this window.
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: T.bgIn,
          borderRadius: "4px",
          height: "6px",
          overflow: "hidden",
          border: `1px solid ${T.bd}`,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: T.acc,
            borderRadius: "4px",
            transition: "width 0.25s ease",
          }}
        />
      </div>

      {/* Status text */}
      <div style={{ fontSize: "11px", color: T.t3, fontFamily: T.fM }}>
        {status}
      </div>

      {/* Release notes */}
      {notes && (
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            background: T.bgEl,
            border: `1px solid ${T.bd}`,
            borderRadius: "6px",
            padding: "12px 14px",
            fontSize: "12px",
            color: T.t2,
            maxHeight: "80px",
            overflowY: "auto",
            lineHeight: 1.5,
          }}
        >
          {notes}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Updater />
  </StrictMode>
);
