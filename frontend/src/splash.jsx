/**
 * splash.jsx — Forge-branded animated splash screen.
 *
 * Animation sequence (~9.5 seconds):
 *   0.0–1.0s  FADE_IN:  Background + anvil + R3P header fade in; bolt is dull amber.
 *   1.0–2.0s  SPARKS:   Hammer descent begins; phase list starts streaming.
 *   2.0–6.5s  WELDING:  Hammer strike loop (~1.6 s per cycle); sparks radiate;
 *                        bolt flashes white-hot then cools; locked segments → amber.
 *   6.5–7.5s  CLANK:    Final decisive strike; bolt fully locked amber; arc crackle.
 *   7.5–9.0s  FINAL:    Hammer at rest; bolt holds steady amber glow + breathing.
 *   9.0–10.0s FADE_OUT: Scene fades to black.
 *
 * Click / Esc / Space → skip to fade-out immediately.
 */

import { StrictMode, useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./splash.css";
import sprocketHammerSvg from "./assets/splash/sprocket-hammer.svg?raw";
import r3pLogoUrl from "./assets/splash/r3p-logo-transparent.svg";

// APP_VERSION — injected at build time by Vite; fallback to package version.
// The typeof guard makes this safe in browser-preview mode (no Vite define).
/* global __APP_VERSION__ */
const APP_VERSION =
  (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null) ??
  import.meta.env.VITE_APP_VERSION ??
  "4.1.0";

// Maximum number of Rust phases whose completion locks a bolt segment to amber.
// Corresponds to CSS classes .bolt-locked-1 / .bolt-locked-2 / .bolt-locked-3.
const MAX_LOCKED_PHASES = 3;

// Dynamic import so the app never crashes if Tauri IPC is absent (browser preview).
const getTauriApi = async () => {
  try {
    const [{ listen }, { invoke }] = await Promise.all([
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/core"),
    ]);
    return { listen, invoke };
  } catch {
    return null;
  }
};

// ── Constants ────────────────────────────────────────────────────────────
const PHASE = {
  INIT:      0,
  FADE_IN:   1,   // 0–1 s   — background + anvil fade in; bolt dull amber
  SPARKS:    2,   // 1–2 s   — hammer descent begins
  WELDING:   3,   // 2–6.5 s — hammer strike loop; bolt heats/cools
  CLANK:     4,   // 6.5–7.5 s — final decisive strike; arc crackle
  FINAL:     5,   // 7.5–9.0 s — hammer rests; bolt breathing amber glow
  FADE_OUT:  6,   // 9.0–10.0 s — fade to black
};

// ── Status line helpers ───────────────────────────────────────────────────
function prefixForKind(kind) {
  switch (kind) {
    case "ok":      return "[✓]";
    case "warn":    return "[!]";
    case "error":   return "[✗]";
    case "pending": return "[ ]";
    default:        return ">";
  }
}

function prefixClass(kind) {
  switch (kind) {
    case "ok":      return "prefix-ok";
    case "warn":    return "prefix-warn";
    case "error":   return "prefix-error";
    default:        return "prefix-pending";
  }
}

function msgClass(kind) {
  switch (kind) {
    case "ok":      return "msg-ok";
    case "warn":    return "msg-warn";
    case "error":   return "msg-error";
    default:        return "msg-pending";
  }
}

// ── Main component ────────────────────────────────────────────────────────
function Splash() {
  const [phase, setPhase]                   = useState(PHASE.INIT);
  const [contentVisible, setContentVisible] = useState(false);
  const [fadingOut, setFadingOut]           = useState(false);
  const [titleVisible, setTitleVisible]     = useState(false);
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [flash, setFlash]                   = useState(false);
  const [arcCrackle, setArcCrackle]         = useState(false);
  // null = unknown (waiting for Tauri), true = first run (full mode), false = short mode
  const [isFirstRun, setIsFirstRun]         = useState(null);

  // Terminal lines: { phase, prefix, pClass, msg, mClass, done }
  const [lines, setLines] = useState([]);

  // Stable map of phase id → array index, for in-place dedup updates.
  const linesByPhaseRef = useRef({});

  // Progress bar: count phases that have transitioned away from Pending (max 4).
  const [completedPhaseCount, setCompletedPhaseCount] = useState(0);
  const completedPhasesRef = useRef(new Set());

  // Queue of incoming status events from Rust
  const statusQueueRef = useRef([]);
  const skippedRef      = useRef(false);
  const phaseRef        = useRef(PHASE.INIT);
  const tauriRef        = useRef(null);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Line-in engine ───────────────────────────────────────────────────────
  // Store typeLineIn in a ref so drainQueue can call it without creating a
  // circular dependency in the useCallback dependency arrays.
  const typeLineInRef = useRef(null);

  const drainQueue = useCallback(() => {
    const next = statusQueueRef.current.shift();
    if (!next) return;
    typeLineInRef.current?.(next);
  }, []); // reads only refs — stable for component lifetime

  // Wire typeLineIn via the ref so both callbacks share access.
  typeLineInRef.current = (item) => {
    const { phase, message, kind } = item;

    // ── In-place update: phase already has a line ──────────────────────────
    // This happens when Rust sends Pending then Ok/Warn/Error for the same
    // phase.  Update the prefix/color without re-running the fade-in animation.
    if (phase && linesByPhaseRef.current[phase] !== undefined) {
      const idx = linesByPhaseRef.current[phase];
      setLines((prev) => {
        const arr = [...prev];
        arr[idx] = {
          ...arr[idx],
          prefix: prefixForKind(kind),
          pClass: prefixClass(kind),
          mClass: msgClass(kind),
          done: true,
        };
        return arr;
      });
      // Track phase completion (Pending → Ok/Warn/Error).
      if (kind !== "pending" && !completedPhasesRef.current.has(phase)) {
        completedPhasesRef.current.add(phase);
        setCompletedPhaseCount((n) => Math.min(n + 1, 4));
      }
      drainQueue();
      return;
    }

    // ── New phase: append full text immediately; CSS handles the fade-in ───
    const prefix = prefixForKind(kind);
    const pClass = prefixClass(kind);
    const mClass = msgClass(kind);

    setLines((prev) => {
      const newIdx = prev.length;
      if (phase) linesByPhaseRef.current[phase] = newIdx;
      return [...prev, { phase, prefix, pClass, msg: message, mClass, done: true }];
    });
    drainQueue();
  };

  // ── Skip handler ─────────────────────────────────────────────────────────
  const requestSkip = useCallback(() => {
    if (skippedRef.current) return;
    if (phaseRef.current >= PHASE.FADE_OUT) return;
    skippedRef.current = true;

    // Flush any queued status lines
    while (statusQueueRef.current.length > 0) {
      const item = statusQueueRef.current.shift();
      const { phase, message, kind } = item;

      if (phase && linesByPhaseRef.current[phase] !== undefined) {
        // Update existing line in place
        const idx = linesByPhaseRef.current[phase];
        setLines((prev) => {
          const arr = [...prev];
          arr[idx] = {
            ...arr[idx],
            prefix: prefixForKind(kind),
            pClass: prefixClass(kind),
            mClass: msgClass(kind),
            done: true,
          };
          return arr;
        });
      } else {
        // New phase — append with final text
        setLines((prev) => {
          const newIdx = prev.length;
          if (phase) linesByPhaseRef.current[phase] = newIdx;
          return [
            ...prev,
            {
              phase,
              prefix: prefixForKind(kind),
              pClass: prefixClass(kind),
              msg: message,
              mClass: msgClass(kind),
              done: true,
            },
          ];
        });
      }
    }

    // Start fade-out
    setFadingOut(true);
    setPhase(PHASE.FADE_OUT);

    // Notify Rust to skip the minimum wait
    tauriRef.current?.invoke("request_skip_splash").catch(() => {});
  }, []);

  // ── Tauri event wiring ───────────────────────────────────────────────────
  useEffect(() => {
    let unlisten = null;
    getTauriApi().then((api) => {
      if (!api) {
        // Browser preview — no Tauri IPC; default to full mode
        setIsFirstRun(true);
        return;
      }
      tauriRef.current = api;
      api
        .listen("splash://status", (ev) => {
          const { message, kind, phase } = ev.payload ?? {};
          if (!message) return;
          // Use the phase id from Rust; null for events without a phase so that
          // no unintended deduplication occurs (in-place update requires a non-null phase).
          statusQueueRef.current.push({ phase: phase ?? null, message, kind: kind ?? "pending" });
          drainQueue();
        })
        .then((fn) => {
          unlisten = fn;
        });

      // Query first-run flag to decide full (9.5 s) vs. short (3.2 s) mode.
      api.invoke("splash_is_first_run")
        .then((val) => setIsFirstRun(Boolean(val)))
        .catch(() => setIsFirstRun(true)); // Default to full mode on error
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [drainQueue]);

  // ── Keyboard skip ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === " ") requestSkip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [requestSkip]);

  // ── Phase sequencer ───────────────────────────────────────────────────────
  useEffect(() => {
    // Phase 1: Fade-in (0–1 s) — background + anvil fade in; bolt is dull amber
    const t1 = setTimeout(() => {
      setPhase(PHASE.FADE_IN);
      setContentVisible(true);
      setTitleVisible(true);
      setTimeout(() => setTaglineVisible(true), 400);
    }, 50);

    // Phase 2: Sparks begin (1 s) — hammer first descent
    const t2 = setTimeout(() => {
      setPhase(PHASE.SPARKS);
    }, 1000);

    // Phase 3: Heavy welding (2 s) — hammer strike loop; sparks; bolt heats/cools
    const t3 = setTimeout(() => {
      setPhase(PHASE.WELDING);
    }, 2000);

    // Phase 4: Clank (6.5 s) — final decisive strike; arc crackle; bolt fully locked
    const t4 = setTimeout(() => {
      setPhase(PHASE.CLANK);

      // Impact flash
      setFlash(true);
      setTimeout(() => setFlash(false), 400);

      // Electric arc crackle along bolt
      setArcCrackle(true);
      setTimeout(() => setArcCrackle(false), 800);
    }, 6500);

    // Phase 5: Final (7.5 s) — hammer rests; bolt breathing amber glow
    const t5 = setTimeout(() => {
      setPhase(PHASE.FINAL);
    }, 7500);

    // Phase 6: Fade-out (9 s)
    const t6 = setTimeout(() => {
      if (!skippedRef.current) {
        setPhase(PHASE.FADE_OUT);
        setFadingOut(true);
      }
    }, 9000);

    return () => {
      [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  // Content container class
  let contentClass = "splash-content";
  if (contentVisible) contentClass += " visible";
  if (fadingOut)      contentClass += " fading-out";

  // Phase CSS class (drives all forge animations)
  const phaseNames = ["init","fade-in","sparks","welding","clank","final","fade-out"];
  const phaseCss   = phaseNames[phase] ?? "init";

  // Forge scene class — class additions drive CSS keyframe animations on SVG internals
  let forgeClass = `forge-scene phase-${phaseCss}`;
  if (arcCrackle)  forgeClass += " arc-crackle";
  // bolt-locked-N: tracks how many Rust phases have resolved (0–MAX_LOCKED_PHASES)
  forgeClass += ` bolt-locked-${Math.min(completedPhaseCount, MAX_LOCKED_PHASES)}`;

  return (
    <div
      className={`splash-root${isFirstRun === false ? " short-mode" : ""}`}
      onClick={requestSkip}
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {/* Warm vignette */}
      <div className="vignette" />

      {/* Flash overlay */}
      <div className={`flash-overlay${flash ? " flash" : ""}`} />

      {/* Main content */}
      <div className={contentClass}>

        {/* R3P monogram logo — official corporate mark */}
        <img
          src={r3pLogoUrl}
          className="r3p-header-logo"
          role="img"
          aria-label="R3P"
          alt="R3P"
        />

        {/* TRANSMITTAL BUILDER wordmark */}
        <div className={`app-title${titleVisible ? " visible" : ""}`}>
          Transmittal Builder
        </div>

        {/* Subtitle: ENGINEERED TO DELIVER */}
        <p className="subtitle">
          <span className="sub-tag">ENGINEERED TO DELIVER</span>
        </p>

        {/* Sprocket+hammer scene — SVG is inline so CSS targets #hammer, #sprocket, etc. */}
        <div
          className={forgeClass}
          dangerouslySetInnerHTML={{ __html: sprocketHammerSvg }}
          aria-hidden="true"
        />

        {/* Progress bar — in content flow, between forge scene and terminal */}
        <div className={`progress-track${taglineVisible ? " visible" : ""}`}>
          <div
            className="progress-fill"
            style={{ width: `${(completedPhaseCount / 4) * 100}%` }}
          />
        </div>

        {/* Terminal block — build-log streaming (unchanged) */}
        <div className="terminal-block">
          {lines.map((line, i) => (
            <div key={line.phase ?? i} className="terminal-line">
              <span className="terminal-gutter-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={line.pClass}>{line.prefix}</span>
              <span className={line.mClass}>{line.msg}</span>
            </div>
          ))}
          {/* Cursor on empty terminal (before first event arrives) */}
          {lines.length === 0 && phase >= PHASE.WELDING && (
            <div className="terminal-line">
              <span className="terminal-gutter-num" aria-hidden="true" />
              <span className="prefix-pending">{">"}</span>
              <span className="msg-pending"><span className="cursor" /></span>
            </div>
          )}
        </div>
      </div>

      {/* Version metadata row */}
      <div className={`version-meta${taglineVisible ? " visible" : ""}`}>
        v{APP_VERSION}&nbsp;&middot;&nbsp;R3P Transmittal Builder
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
