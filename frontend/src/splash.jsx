/**
 * splash.jsx — Forge-branded animated splash screen.
 *
 * The forge scene (sprocket, hammer, sparks, tooth-glow, impact-flash) runs as
 * a single continuous CSS loop. It is isolated in a memoized component so
 * state updates elsewhere in <Splash> do not trigger React reconciliation on
 * the SVG branch — this is critical for keeping the animation smooth during
 * the initial Tauri startup when ~20 state updates per second land on the
 * parent from the spinner + progress crawler + status events.
 *
 * Chrome sequence (driven by setTimeout in the sequencer useEffect):
 *   t=   50 ms  content fades in
 *   t=  850 ms  progress bar + version meta fade in
 *   t= 8500 ms  clank impact (flash overlay)
 *   t=10500 ms  content fades out
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
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

// ── Runtime Tauri guard ────────────────────────────────────────────────────
// window.__TAURI_INTERNALS__ is injected by the Tauri webview; absent in any
// plain browser.  All IPC calls (listen / invoke) must be guarded by this flag
// because the module imports succeed in Vite dev mode but the IPC calls throw
// "Cannot read properties of undefined (reading 'transformCallback')" at runtime.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── Browser-preview URL param overrides ──────────────────────────────────
// Parsed once at module load.  Completely ignored when running inside Tauri.
//   ?loop=1         — replay the full sequence on every cycle instead of ending
//   ?mode=short|full — override short/full mode without rebuilding Tauri
const _previewParams = !isTauri ? new URLSearchParams(window.location.search) : null;
const PREVIEW_LOOP_MODE    = _previewParams?.get("loop") === "1";
const PREVIEW_FORCED_MODE  = _previewParams?.get("mode") ?? null;
if (!isTauri && (PREVIEW_LOOP_MODE || PREVIEW_FORCED_MODE)) {
  const parts = [
    PREVIEW_LOOP_MODE    && "loop=1",
    PREVIEW_FORCED_MODE  && `mode=${PREVIEW_FORCED_MODE}`,
  ].filter(Boolean);
  console.log(`[splash] Preview overrides: ${parts.join(", ")}`);
}

// Dynamic import so the app never crashes if Tauri IPC is absent (browser preview).
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

// ── ForgeScene: memoized SVG container ───────────────────────────────────
// CRITICAL: this component is wrapped in memo() so it never re-renders due to
// state updates elsewhere in <Splash>. Without this, every spinner tick and
// progress crawler tick would reconcile the SVG branch and starve the CSS
// animation of main-thread time during the first 3s of startup — which was
// the visible "sprocket hangs up during stage 01 then unfreezes at stage 03"
// bug.
const ForgeScene = memo(function ForgeScene() {
  return (
    <div
      className="forge-scene"
      dangerouslySetInnerHTML={{ __html: sprocketHammerSvg }}
      aria-hidden="true"
    />
  );
});

// ── Main component ────────────────────────────────────────────────────────
function Splash({ onLoopRestart = null }) {
  const reducedMotion                       = usePrefersReducedMotion();
  const [contentVisible, setContentVisible] = useState(false);
  const [fadingOut, setFadingOut]           = useState(false);
  const [chromeVisible, setChromeVisible]   = useState(false);
  const [flash, setFlash]                   = useState(false);
  // null = unknown (waiting for Tauri), true = first run (full mode), false = short mode
  const [isFirstRun, setIsFirstRun]         = useState(null);

  // Terminal lines: { phase, prefix, pClass, msg, mClass, done, spinnerFrame }
  const [lines, setLines] = useState([]);

  // Spinner frame index — ticks every 90 ms while any line is still pending.
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const spinnerTimerRef = useRef(null);

  // Progress bar: count phases that have transitioned away from Pending (max 4).
  const [completedPhaseCount, setCompletedPhaseCount] = useState(0);
  const completedPhasesRef = useRef(new Set());

  // Smooth progress bar: displayProgress crawls between phase events to avoid dead zones.
  const [displayProgress, setDisplayProgress] = useState(0);
  const startTimeRef = useRef(Date.now());

  // ── Minimum-duration queue ────────────────────────────────────────────────
  const pendingStartRef  = useRef({});   // phase → Date.now() when Pending emitted
  const lastTransitionRef = useRef(0);   // Date.now() of last apply call

  // Queue of incoming status events from Rust
  const statusQueueRef = useRef([]);
  const tauriRef        = useRef(null);
  const clankImpactTimerRef = useRef(null);
  const onLoopRestartRef = useRef(onLoopRestart);
  useEffect(() => { onLoopRestartRef.current = onLoopRestart; }, [onLoopRestart]);

  // ── Spinner tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    const hasPending = lines.some((l) => !l.done);
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
        if (completedPhaseCount >= 4) return 100;
        const elapsed = Date.now() - startTimeRef.current;
        const timeBased = Math.min((elapsed / TOTAL_ANIMATION_MS) * 100, 95);
        const eventFloor = (completedPhaseCount / 4) * 100;
        return Math.max(p, eventFloor, Math.min(timeBased, 95));
      });
    }, 100);
    return () => clearInterval(id);
  }, [completedPhaseCount]);

  // ── Splash ready: show window after first CSS paint ───────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        getTauriApi().then((api) =>
          api?.invoke("splash_ready").catch(() => {})
        );
      });
    });
  }, []);

  // ── Line-in engine ───────────────────────────────────────────────────────
  const drainingRef   = useRef(false);
  const typeLineInRef = useRef(null);

  const drainQueue = useCallback(() => {
    if (drainingRef.current) return;
    const next = statusQueueRef.current.shift();
    if (!next) return;
    typeLineInRef.current?.(next);
  }, []);

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

      return [...prev, { phase, kind, pClass, msg: message, mClass, done: kind !== "pending" }];
    });

    if (phase && kind !== "pending" && !completedPhasesRef.current.has(phase)) {
      completedPhasesRef.current.add(phase);
      setCompletedPhaseCount((n) => Math.min(n + 1, 4));
    }

    lastTransitionRef.current = Date.now();
    drainingRef.current = false;
    drainQueue();
  }, [drainQueue]);

  typeLineInRef.current = (item) => {
    const { phase, kind } = item;
    const now = Date.now();
    drainingRef.current = true;

    if (kind === "pending") {
      if (phase) pendingStartRef.current[phase] = now;
      const gapNeeded = MIN_GAP_MS - (now - lastTransitionRef.current);
      if (gapNeeded > 0) {
        setTimeout(() => applyLineUpdate(item), gapNeeded);
      } else {
        applyLineUpdate(item);
      }
      return;
    }

    const pendingStart = phase ? (pendingStartRef.current[phase] ?? now) : now;
    const pendingAge = now - pendingStart;
    const pendingWait = Math.max(0, MIN_PENDING_MS - pendingAge);
    const gapNeeded = MIN_GAP_MS - (now - lastTransitionRef.current);
    const totalWait = Math.max(pendingWait, gapNeeded);

    if (totalWait > 0) {
      setTimeout(() => applyLineUpdate(item), totalWait);
    } else {
      applyLineUpdate(item);
    }
  };

  // ── Tauri event wiring ───────────────────────────────────────────────────
  useEffect(() => {
    let unlisten = null;
    const previewTimers = [];
    getTauriApi().then((api) => {
      if (!api) {
        console.log("[splash] Running in browser preview mode (no Tauri IPC)");
        if (PREVIEW_FORCED_MODE === "short") setIsFirstRun(false);
        else setIsFirstRun(true);

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
        return;
      }
      tauriRef.current = api;
      try {
        api
          .listen("splash://status", (ev) => {
            const { message, kind, phase } = ev.payload ?? {};
            if (!message) return;
            statusQueueRef.current.push({ phase: phase ?? null, message, kind: kind ?? "pending" });
            drainQueue();
          })
          .then((fn) => {
            unlisten = fn;
          });
      } catch (err) {
        console.warn("[splash] Tauri IPC unavailable, running in preview mode", err);
      }

      api.invoke("splash_is_first_run")
        .then((val) => setIsFirstRun(Boolean(val)))
        .catch(() => setIsFirstRun(true));
    });
    return () => {
      if (unlisten) unlisten();
      previewTimers.forEach(clearTimeout);
    };
  }, [drainQueue]);

  // ── Chrome sequencer ─────────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setContentVisible(true), 50);
    const tChrome = setTimeout(() => setChromeVisible(true), 850);

    const tClank = setTimeout(() => {
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    }, 8500);

    const tFadeOut = setTimeout(() => {
      if (!isTauri && PREVIEW_LOOP_MODE && onLoopRestartRef.current) {
        onLoopRestartRef.current();
      } else {
        setFadingOut(true);
      }
    }, 10500);

    return () => {
      [t1, tChrome, tClank, tFadeOut].forEach(clearTimeout);
      if (clankImpactTimerRef.current) clearTimeout(clankImpactTimerRef.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  let contentClass = "splash-content";
  if (contentVisible) contentClass += " visible";
  if (fadingOut)      contentClass += " fading-out";

  return (
    <div
      className={`splash-root${isFirstRun === false ? " short-mode" : ""}`}
      style={{ WebkitAppRegion: "no-drag" }}
    >
      <div className="vignette" />

      <div className={`flash-overlay${flash ? " flash" : ""}`} />

      <div className={contentClass}>

        <img
          src={r3pLogoUrl}
          className="r3p-header-logo"
          role="img"
          aria-label="R3P"
          alt="R3P"
        />

        <div className={`app-title${contentVisible ? " visible" : ""}`}>
          Transmittal Builder
        </div>

        <p className="subtitle">
          <span className="sub-tag">ENGINEERED TO DELIVER</span>
        </p>

        {/* Forge scene — memoized so spinner/progress/line updates don't
            reconcile the SVG branch and starve the CSS animation of frames. */}
        <ForgeScene />

        <div className={`progress-track${chromeVisible ? " visible" : ""}`}>
          <div
            className="progress-fill"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

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
          {lines.length === 0 && contentVisible && (
            <div className="terminal-line">
              <span className="terminal-gutter-num" aria-hidden="true" />
              <span className="prefix-pending">{">"}</span>
              <span className="msg-pending"><span className="cursor" /></span>
            </div>
          )}
        </div>
      </div>

      <div className={`version-meta${chromeVisible ? " visible" : ""}`}>
        v{APP_VERSION}&nbsp;&middot;&nbsp;R3P Transmittal Builder
      </div>
    </div>
  );
}

// ── SplashApp: thin wrapper that owns the loop key ───────────────────────
function SplashApp() {
  const [loopKey, setLoopKey] = useState(0);
  return <Splash key={loopKey} onLoopRestart={() => setLoopKey((k) => k + 1)} />;
}

createRoot(document.getElementById("root")).render(<SplashApp />);
