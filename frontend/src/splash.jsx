/**
 * splash.jsx — Forge-branded animated splash screen.
 *
 * Animation sequence (~13 seconds):
 *   0.0–1.5s  FADE_IN:  Background + anvil + R3P header fade in; sprocket/hammer begin.
 *   1.5–2.5s  SPARKS:   Hammer idle sway transitions; phase list starts streaming.
 *   2.5–8.5s  WELDING:  Hammer strike loop (~1.6 s per cycle); sparks radiate;
 *                        bolt flashes white-hot then cools; locked segments → amber.
 *   8.5–9.5s  CLANK:    Final decisive strike; bolt fully locked amber; arc crackle.
 *   9.5–10.5s FINAL:    Hammer at rest; bolt holds steady amber glow + breathing.
 *   10.5–11.5s FADE_OUT: Scene fades to black.
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

// ── Runtime Tauri guard ────────────────────────────────────────────────────
// window.__TAURI_INTERNALS__ is injected by the Tauri webview; absent in any
// plain browser.  All IPC calls (listen / invoke) must be guarded by this flag
// because the module imports succeed in Vite dev mode but the IPC calls throw
// "Cannot read properties of undefined (reading 'transformCallback')" at runtime.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── Browser-preview URL param overrides ──────────────────────────────────
// Parsed once at module load.  Completely ignored when running inside Tauri.
//   ?phase=welding  — jump directly to that phase and stay there indefinitely
//   ?loop=1         — replay the full sequence on every cycle instead of ending
//   ?mode=short|full — override short/full mode without rebuilding Tauri
const _previewParams = !isTauri ? new URLSearchParams(window.location.search) : null;
const PREVIEW_FORCED_PHASE = _previewParams?.get("phase") ?? null;
const PREVIEW_LOOP_MODE    = _previewParams?.get("loop") === "1";
const PREVIEW_FORCED_MODE  = _previewParams?.get("mode") ?? null;
if (!isTauri && (PREVIEW_FORCED_PHASE || PREVIEW_LOOP_MODE || PREVIEW_FORCED_MODE)) {
  const parts = [
    PREVIEW_FORCED_PHASE && `phase=${PREVIEW_FORCED_PHASE}`,
    PREVIEW_LOOP_MODE    && "loop=1",
    PREVIEW_FORCED_MODE  && `mode=${PREVIEW_FORCED_MODE}`,
  ].filter(Boolean);
  console.log(`[splash] Preview overrides: ${parts.join(", ")}`);
}

// Dynamic import so the app never crashes if Tauri IPC is absent (browser preview).
// Returns null immediately when isTauri is false — the module itself loads fine
// from Vite but calling listen/invoke would throw without __TAURI_INTERNALS__.
const getTauriApi = async () => {
  if (!isTauri) return null;
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

// ── Reduced-motion helper ─────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}


const PHASE = {
  INIT:      0,
  FADE_IN:   1,   // 0–1.5 s   — background + anvil fade in; sprocket/hammer begin gently
  SPARKS:    2,   // 1.5–2.5 s — hammer idle sway transitions to strike
  WELDING:   3,   // 2.5–8.5 s — hammer strike loop; bolt heats/cools
  CLANK:     4,   // 8.5–9.5 s — final decisive strike; arc crackle
  FINAL:     5,   // 9.5–10.5 s — hammer rests; bolt breathing amber glow
  FADE_OUT:  6,   // 10.5–11.5 s — fade to black
};

// Braille spinner frames — classic terminal look, cycles at ~90 ms/frame.
const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

// Minimum ms a phase must be visible in Pending state before Ok can render.
const MIN_PENDING_MS = 700;
// Minimum ms gap between consecutive phase transitions.
const MIN_GAP_MS = 400;

// ── Status line helpers ───────────────────────────────────────────────────
function prefixForKind(kind, spinnerFrame, reducedMotion) {
  switch (kind) {
    case "ok":      return "[✓]";
    case "warn":    return "[!]";
    case "error":   return "[✗]";
    case "pending":
      return reducedMotion
        ? "[…]"
        : `[${SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]}]`;
    default:        return ">";
  }
}

function prefixClass(kind) {
  switch (kind) {
    case "ok":      return "prefix-ok prefix-resolved";
    case "warn":    return "prefix-warn prefix-resolved";
    case "error":   return "prefix-error prefix-resolved";
    default:        return "prefix-pending status-spinner";
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
function Splash({ onLoopRestart = null }) {
  const reducedMotion                       = usePrefersReducedMotion();
  const [phase, setPhase]                   = useState(PHASE.INIT);
  const [contentVisible, setContentVisible] = useState(false);
  const [fadingOut, setFadingOut]           = useState(false);
  const [chromeVisible, setChromeVisible]   = useState(false);
  const [flash, setFlash]                   = useState(false);
  const [arcCrackle, setArcCrackle]         = useState(false);
  // null = unknown (waiting for Tauri), true = first run (full mode), false = short mode
  const [isFirstRun, setIsFirstRun]         = useState(null);
  // Skip hint — appears after ~3s so it doesn't compete with early animation
  const [skipHintVisible, setSkipHintVisible] = useState(false);

  // Terminal lines: { phase, prefix, pClass, msg, mClass, done, spinnerFrame }
  const [lines, setLines] = useState([]);

  // Spinner frame index — ticks every 90 ms while any line is still pending.
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const spinnerTimerRef = useRef(null);

  // Stable map of phase id → array index, for in-place dedup updates.
  const linesByPhaseRef = useRef({});

  // Progress bar: count phases that have transitioned away from Pending (max 4).
  const [completedPhaseCount, setCompletedPhaseCount] = useState(0);
  const completedPhasesRef = useRef(new Set());

  // Smooth progress bar: displayProgress crawls between phase events to avoid dead zones.
  const [displayProgress, setDisplayProgress] = useState(0);
  const startTimeRef = useRef(Date.now());

  // ── Minimum-duration queue ────────────────────────────────────────────────
  // Each entry: { phase, message, kind }
  // We enforce MIN_PENDING_MS before applying an Ok/warn/error on a phase that
  // was just set to Pending, and MIN_GAP_MS between consecutive transitions.
  const pendingStartRef  = useRef({});   // phase → Date.now() when Pending emitted
  const lastTransitionRef = useRef(0);   // Date.now() of last apply call

  // Queue of incoming status events from Rust
  const statusQueueRef = useRef([]);
  const skippedRef      = useRef(false);
  const phaseRef        = useRef(PHASE.INIT);
  const tauriRef        = useRef(null);
  const clankImpactTimerRef = useRef(null);
  // Stable ref to the loop-restart callback so the phase sequencer effect
  // can call it without needing it in its dependency array.
  const onLoopRestartRef = useRef(onLoopRestart);
  useEffect(() => { onLoopRestartRef.current = onLoopRestart; }, [onLoopRestart]);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Spinner tick ──────────────────────────────────────────────────────────
  // Start/stop the braille spinner based on whether any line is pending.
  // Skipped when prefers-reduced-motion is active (static […] shown instead).
  const hasPendingRef = useRef(false);
  useEffect(() => {
    const hasPending = lines.some((l) => !l.done);
    hasPendingRef.current = hasPending;
    if (hasPending && !reducedMotion) {
      if (!spinnerTimerRef.current) {
        spinnerTimerRef.current = setInterval(() => {
          setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
        }, 90);
      }
    } else {
      if (spinnerTimerRef.current) {
        clearInterval(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    }
  }, [lines, reducedMotion]);

  // Cleanup spinner on unmount.
  useEffect(() => () => {
    if (spinnerTimerRef.current) clearInterval(spinnerTimerRef.current);
  }, []);

  // ── Progress bar floor: snap upward when a phase completes ───────────────
  useEffect(() => {
    const floor = (completedPhaseCount / 4) * 100;
    setDisplayProgress((p) => Math.max(p, floor));
  }, [completedPhaseCount]);

  // ── Progress bar crawler: time-anchored, always-advancing, caps at 95% ───
  useEffect(() => {
    const TOTAL_ANIMATION_MS = 10500;
    const id = setInterval(() => {
      setDisplayProgress((p) => {
        // Final event → let the phase count drive us to 100%
        if (completedPhaseCount >= 4) return 100;
        
        // Time-based floor: bar always reflects total elapsed progress, capped at 95%
        const elapsed = Date.now() - startTimeRef.current;
        const timeBased = Math.min((elapsed / TOTAL_ANIMATION_MS) * 100, 95);
        
        // Event floor: each completed phase snaps the bar up to 25/50/75%
        const eventFloor = (completedPhaseCount / 4) * 100;
        
        // Never regress, never pretend to be done
        return Math.max(p, eventFloor, Math.min(timeBased, 95));
      });
    }, 100);
    return () => clearInterval(id);
  }, [completedPhaseCount]);

  // ── Splash ready: show window after first CSS paint ───────────────────────
  // The splash window is created with visible:false to prevent a transparent-
  // ghost flash before React mounts.  We show it here after a double RAF so
  // the background colour is guaranteed to have painted.
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        getTauriApi().then((api) =>
          // Failures are intentionally ignored: if Tauri IPC is unavailable
          // (browser preview) or the window is already closing, the visible:false
          // window stays hidden, which is acceptable.
          api?.invoke("splash_ready").catch(() => {})
        );
      });
    });
  }, []);

  // ── Line-in engine ───────────────────────────────────────────────────────
  // drainQueue is called when a new event arrives OR when an async apply
  // completes.  drainingRef prevents concurrent processing — if a setTimeout
  // is already in flight we let the queue accumulate and process the next
  // item only after the in-flight timer fires.
  const drainingRef   = useRef(false);
  const typeLineInRef = useRef(null);

  const drainQueue = useCallback(() => {
    if (drainingRef.current) return; // a timer is already in flight
    const next = statusQueueRef.current.shift();
    if (!next) return;
    typeLineInRef.current?.(next);
  }, []); // reads only refs — stable for component lifetime

  // applyLineUpdate: actually write the status to React state, then drain next.
  const applyLineUpdate = useCallback((item) => {
    const { phase, message, kind } = item;
    const pClass = prefixClass(kind);
    const mClass = msgClass(kind);

    setLines((prev) => {
      const existingIdx = phase
        ? prev.findIndex((l) => l.phase === phase)
        : -1;

      if (existingIdx !== -1) {
        const arr = [...prev];
        arr[existingIdx] = {
          ...arr[existingIdx],
          kind,
          pClass,
          mClass,
          done: kind !== "pending",
        };
        return arr;
      }

      // New phase — append
      const newIdx = prev.length;
      if (phase) linesByPhaseRef.current[phase] = newIdx;
      return [...prev, { phase, kind, pClass, msg: message, mClass, done: kind !== "pending" }];
    });

    // Track phase completion outside setLines (uses a Set keyed on phase id).
    if (phase && kind !== "pending" && !completedPhasesRef.current.has(phase)) {
      completedPhasesRef.current.add(phase);
      setCompletedPhaseCount((n) => Math.min(n + 1, 4));
    }

    lastTransitionRef.current = Date.now();
    drainingRef.current = false;
    drainQueue();
  }, [drainQueue]);

  // Wire typeLineIn via the ref so both callbacks share access.
  typeLineInRef.current = (item) => {
    const { phase, kind } = item;
    const now = Date.now();

    // Mark as in-flight so new events don't kick off a second drain.
    drainingRef.current = true;

    if (kind === "pending") {
      // Record when Pending started for this phase.
      if (phase) pendingStartRef.current[phase] = now;

      // Enforce MIN_GAP_MS between consecutive phase transitions.
      const gapNeeded = MIN_GAP_MS - (now - lastTransitionRef.current);
      if (gapNeeded > 0) {
        setTimeout(() => applyLineUpdate(item), gapNeeded);
      } else {
        applyLineUpdate(item);
      }
      return;
    }

    // For ok/warn/error: enforce MIN_PENDING_MS since Pending was applied.
    const pendingStart = phase ? (pendingStartRef.current[phase] ?? now) : now;
    const pendingAge = now - pendingStart;
    const pendingWait = Math.max(0, MIN_PENDING_MS - pendingAge);

    // Also enforce MIN_GAP_MS from the last transition.
    const gapNeeded = MIN_GAP_MS - (now - lastTransitionRef.current);
    const totalWait = Math.max(pendingWait, gapNeeded);

    if (totalWait > 0) {
      setTimeout(() => applyLineUpdate(item), totalWait);
    } else {
      applyLineUpdate(item);
    }
  };

  // ── Skip handler ─────────────────────────────────────────────────────────
  const requestSkip = useCallback(() => {
    if (skippedRef.current) return;
    if (phaseRef.current >= PHASE.FADE_OUT) return;
    skippedRef.current = true;

    // Cancel any pending clank impact effects so they don't fire during fade-out
    if (clankImpactTimerRef.current) {
      clearTimeout(clankImpactTimerRef.current);
      clankImpactTimerRef.current = null;
    }

    // Snap progress to 100% so it doesn't look stalled during fade-out
    setDisplayProgress(100);

    // Flush any queued status lines instantly (drop per-phase delays)
    while (statusQueueRef.current.length > 0) {
      const item = statusQueueRef.current.shift();
      const { phase, message, kind } = item;
      const pClass = prefixClass(kind);
      const mClass = msgClass(kind);

      setLines((prev) => {
        const existingIdx = phase
          ? prev.findIndex((l) => l.phase === phase)
          : -1;
        if (existingIdx !== -1) {
          const arr = [...prev];
          arr[existingIdx] = { ...arr[existingIdx], kind, pClass, mClass, done: kind !== "pending" };
          return arr;
        }
        const newIdx = prev.length;
        if (phase) linesByPhaseRef.current[phase] = newIdx;
        return [...prev, { phase, kind, pClass, msg: message, mClass, done: kind !== "pending" }];
      });
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
    const previewTimers = [];
    getTauriApi().then((api) => {
      if (!api) {
        // Browser preview — no Tauri IPC
        console.log("[splash] Running in browser preview mode (no Tauri IPC)");

        // ?mode=short forces short-mode; everything else uses full mode.
        if (PREVIEW_FORCED_MODE === "short") setIsFirstRun(false);
        else setIsFirstRun(true);

        // Inject fake status events that mirror the Rust startup_sequence,
        // unless a forced phase is active (the scene stays static, no terminal).
        if (!PREVIEW_FORCED_PHASE) {
          const push = (phase, message, kind) => {
            statusQueueRef.current.push({ phase, message, kind });
            drainQueue();
          };
          previewTimers.push(
            setTimeout(() => push("svc",     "Starting backend service", "pending"), 1500),
            setTimeout(() => push("svc",     "Starting backend service", "ok"),      2000),
            setTimeout(() => push("drive",   "Mounting shared drive",    "pending"), 2300),
            setTimeout(() => push("drive",   "Mounting shared drive",    "ok"),      2800),
            setTimeout(() => push("updates", "Checking for updates",     "pending"), 3100),
            setTimeout(() => push("updates", "Checking for updates",     "ok"),      3600),
            setTimeout(() => push("final",   "Ready",                    "ok"),      8500),
          );
        }
        return;
      }
      tauriRef.current = api;
      try {
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
      } catch (err) {
        console.warn("[splash] Tauri IPC unavailable, running in preview mode", err);
      }

      // Query first-run flag to decide full (9.5 s) vs. short (3.2 s) mode.
      api.invoke("splash_is_first_run")
        .then((val) => setIsFirstRun(Boolean(val)))
        .catch(() => setIsFirstRun(true)); // Default to full mode on error
    });
    return () => {
      if (unlisten) unlisten();
      previewTimers.forEach(clearTimeout);
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
    // ── Browser-preview: forced phase — jump directly and stay ─────────────
    // ?phase=welding (etc.) skips auto-advance entirely; scene stays frozen for
    // unlimited inspection time.  No fake status events are injected either.
    if (!isTauri && PREVIEW_FORCED_PHASE) {
      const phaseMap = {
        "fade-in": PHASE.FADE_IN,
        "sparks":  PHASE.SPARKS,
        "welding": PHASE.WELDING,
        "clank":   PHASE.CLANK,
        "final":   PHASE.FINAL,
      };
      const target = phaseMap[PREVIEW_FORCED_PHASE.toLowerCase()];
      if (target !== undefined) {
        setPhase(target);
        setContentVisible(true);
        const tt = setTimeout(() => setChromeVisible(true), 300);
        return () => clearTimeout(tt);
      }
    }

    // Phase 1: Fade-in (0–1.5 s) — background + anvil fade in; sprocket/hammer begin
    const t1 = setTimeout(() => {
      setPhase(PHASE.FADE_IN);
      setContentVisible(true);
      // Stagger chrome so sprocket/hammer has begun gentle motion first
      setTimeout(() => setChromeVisible(true), 800);
    }, 50);

    // Phase 2: Sparks begin (1.5 s) — hammer idle → strike transition
    const t2 = setTimeout(() => {
      setPhase(PHASE.SPARKS);
    }, 1500);

    // Phase 3: Heavy welding (2.5 s) — hammer strike loop; sparks; bolt heats/cools
    const t3 = setTimeout(() => {
      setPhase(PHASE.WELDING);
    }, 2500);

    // Phase 4: Clank (8.5 s) — final decisive strike; arc crackle; bolt fully locked
    const t4 = setTimeout(() => {
      setPhase(PHASE.CLANK);
      // hammer-final-strike is 0.45s ease-in to 0°; fire visual effects at impact, not at phase start
      const impactDelay = 420;
      const t4a = setTimeout(() => {
        setFlash(true);
        setTimeout(() => setFlash(false), 400);
        setArcCrackle(true);
        setTimeout(() => setArcCrackle(false), 800);
      }, impactDelay);
      clankImpactTimerRef.current = t4a;
    }, 8500);

    // Phase 5: Final (9.5 s) — hammer rests; bolt breathing amber glow
    const t5 = setTimeout(() => {
      setPhase(PHASE.FINAL);
    }, 9500);

    // Phase 6: Fade-out (10.5 s) — or loop if ?loop=1 in browser preview
    const t6 = setTimeout(() => {
      if (skippedRef.current) return;
      if (!isTauri && PREVIEW_LOOP_MODE && onLoopRestartRef.current) {
        // Restart the full sequence by remounting the Splash component.
        onLoopRestartRef.current();
      } else {
        setPhase(PHASE.FADE_OUT);
        setFadingOut(true);
      }
    }, 10500);

    // Skip hint — fade in after ~3s so it doesn't compete with early animation
    const t7 = setTimeout(() => setSkipHintVisible(true), 3000);

    return () => {
      [t1, t2, t3, t4, t5, t6, t7].forEach(clearTimeout);
      if (clankImpactTimerRef.current) clearTimeout(clankImpactTimerRef.current);
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
        <div className={`app-title${contentVisible ? " visible" : ""}`}>
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
        <div className={`progress-track${chromeVisible ? " visible" : ""}`}>
          <div
            className="progress-fill"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        {/* Terminal block — build-log streaming (unchanged) */}
        <div className="terminal-block">
          {lines.map((line, i) => (
            <div key={line.phase ?? i} className="terminal-line">
              <span className="terminal-gutter-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={line.pClass}>
                {prefixForKind(line.kind ?? (line.done ? "ok" : "pending"), spinnerFrame, reducedMotion)}
              </span>
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

      {/* Skip hint — appears after scene has established */}
      <div className={`skip-hint${skipHintVisible ? " visible" : ""}${fadingOut ? " hidden" : ""}`}>
        click or press Esc to skip
      </div>

      {/* Version metadata row */}
      <div className={`version-meta${chromeVisible ? " visible" : ""}`}>
        v{APP_VERSION}&nbsp;&middot;&nbsp;R3P Transmittal Builder
      </div>
    </div>
  );
}

// ── SplashApp: thin wrapper that owns the loop key ───────────────────────
// When ?loop=1 is active in browser preview, Splash calls onLoopRestart()
// after FADE_OUT, which increments loopKey and forces a full remount of Splash
// (resetting all state cleanly without manual teardown).
function SplashApp() {
  const [loopKey, setLoopKey] = useState(0);
  return <Splash key={loopKey} onLoopRestart={() => setLoopKey((k) => k + 1)} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SplashApp />
  </StrictMode>
);
