/**
 * splash.jsx — "Forged" animated splash screen.
 *
 * Animation sequence (~10 seconds):
 *   0.0–1.0s  Fade in: blueprint grid, logos slide in from sides.
 *   1.0–2.0s  Spark arc starts, weld glow appears.
 *   2.0–6.5s  Heavy welding: sparks, jitter, terminal text types out.
 *   6.5–7.5s  Clank + settle: burst, flash, logos scale-bounce, arc solidifies.
 *   7.5–9.0s  Final status line types out.
 *   9.0–10.0s Fade out, then window closes via Rust.
 *
 * Click / Esc / Space → skip to fade-out immediately.
 */

import { StrictMode, useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./splash.css";

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

// ── Assets ───────────────────────────────────────────────────────────────
import rustLogoUrl  from "./assets/splash/rust-logo.svg";
import tauriLogoUrl from "./assets/splash/tauri-logo.svg";

// ── Constants ────────────────────────────────────────────────────────────
const PHASE = {
  INIT:      0,
  FADE_IN:   1,   // 0–1 s
  SPARKS:    2,   // 1–2 s
  WELDING:   3,   // 2–6.5 s
  CLANK:     4,   // 6.5–7.5 s
  FINAL:     5,   // 7.5–9.0 s
  FADE_OUT:  6,   // 9.0–10.0 s
};

// Typing speed (ms per character)
const CHAR_MS = 40;

// Spark colours
const SPARK_COLORS = ["#E05D2B", "#FFC131", "#FF8C42", "#FFD966", "#FF6B1A"];

// ── Spark particle generator ─────────────────────────────────────────────
let sparkId = 0;

function makeSpark(originX, originY) {
  const id = ++sparkId;
  const angle = (Math.random() * Math.PI * 2);
  const speed = 40 + Math.random() * 80;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed - (20 + Math.random() * 30); // bias upward
  const size = 2 + Math.random() * 3;
  const duration = 0.4 + Math.random() * 0.6;
  const delay = Math.random() * 0.1;
  const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
  return { id, originX, originY, vx, vy, size, duration, delay, color };
}

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
  const [phase, setPhase]             = useState(PHASE.INIT);
  const [gridVisible, setGridVisible] = useState(false);
  const [logosIn, setLogosIn]         = useState(false);
  const [arcVisible, setArcVisible]   = useState(false);
  const [arcSolid, setArcSolid]       = useState(false);
  const [weldLineUp, setWeldLineUp]   = useState(false);
  const [jitter, setJitter]           = useState(false);
  const [clanked, setClanked]         = useState(false);
  const [flash, setFlash]             = useState(false);
  const [sparks, setSparks]           = useState([]);
  const [contentVisible, setContentVisible] = useState(false);
  const [fadingOut, setFadingOut]     = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [taglineVisible, setTaglineVisible] = useState(false);

  // Terminal lines: { phase, prefix, pClass, msg, mClass, done }
  const [lines, setLines] = useState([]);

  // Stable map of phase id → array index, for in-place dedup updates.
  const linesByPhaseRef = useRef({});

  // Queue of incoming status events from Rust
  const statusQueueRef = useRef([]);
  const isTypingRef     = useRef(false);
  const skippedRef      = useRef(false);
  const phaseRef        = useRef(PHASE.INIT);
  const sparkTimerRef   = useRef(null);
  const audioWeldRef    = useRef(null);
  const audioClankRef  = useRef(null);
  const tauriRef        = useRef(null);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Audio setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Gracefully load audio — never crash if files are missing.
    try {
      const weld = new Audio(
        /* @vite-ignore */ new URL("./assets/splash/weld-loop.ogg", import.meta.url).href,
      );
      weld.loop = true;
      weld.volume = 0.3;
      audioWeldRef.current = weld;
    } catch { /* no sound */ }

    try {
      const clank = new Audio(
        /* @vite-ignore */ new URL("./assets/splash/clank.ogg", import.meta.url).href,
      );
      clank.volume = 0.7;
      audioClankRef.current = clank;
    } catch { /* no sound */ }
  }, []);

  // ── Audio helpers ────────────────────────────────────────────────────────
  // These read only stable refs (audioWeldRef, audioClankRef), so useCallback
  // with empty deps gives stable function references for the phase sequencer.
  const playWeldAudio = useCallback(() => {
    if (!audioWeldRef.current) return;
    try {
      audioWeldRef.current.currentTime = 0;
      audioWeldRef.current.play();
    } catch { /* silence */ }
  }, []);

  const stopWeldAudio = useCallback(() => {
    if (!audioWeldRef.current) return;
    try { audioWeldRef.current.pause(); } catch { /* silence */ }
  }, []);

  const playClankAudio = useCallback(() => {
    if (!audioClankRef.current) return;
    try {
      audioClankRef.current.currentTime = 0;
      audioClankRef.current.play();
    } catch { /* silence */ }
  }, []);

  // ── Typewriter engine ────────────────────────────────────────────────────
  // Store typeLineIn in a ref so drainQueue can call it without creating a
  // circular dependency in the useCallback dependency arrays.
  const typeLineInRef = useRef(null);

  const drainQueue = useCallback(() => {
    if (isTypingRef.current) return;
    const next = statusQueueRef.current.shift();
    if (!next) return;
    typeLineInRef.current?.(next);
  }, []); // reads only refs — stable for component lifetime

  // Wire typeLineIn via the ref so both callbacks share access.
  typeLineInRef.current = (item) => {
    const { phase, message, kind } = item;

    // ── In-place update: phase already has a line ──────────────────────────
    // This happens when Rust sends Pending then Ok/Warn/Error for the same
    // phase.  Update the prefix/colour without retyping the text.
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
      // Not typing — immediately drain the next queued item.
      drainQueue();
      return;
    }

    // ── New phase: append and type the text character by character ─────────
    isTypingRef.current = true;
    const prefix = prefixForKind(kind);
    const fullText = message;
    const pClass = prefixClass(kind);
    const mClass = msgClass(kind);

    setLines((prev) => {
      const newIdx = prev.length;
      if (phase) linesByPhaseRef.current[phase] = newIdx;
      return [...prev, { phase, prefix, pClass, msg: "", mClass, done: false }];
    });

    let charIdx = 0;
    const advance = () => {
      if (skippedRef.current) {
        // Flush remaining characters instantly on skip.
        setLines((prev) => {
          const arr = [...prev];
          arr[arr.length - 1] = { ...arr[arr.length - 1], msg: fullText, done: true };
          return arr;
        });
        isTypingRef.current = false;
        drainQueue();
        return;
      }

      charIdx++;
      setLines((prev) => {
        const arr = [...prev];
        arr[arr.length - 1] = {
          ...arr[arr.length - 1],
          msg: fullText.slice(0, charIdx),
          done: charIdx >= fullText.length,
        };
        return arr;
      });

      if (charIdx < fullText.length) {
        setTimeout(advance, CHAR_MS);
      } else {
        isTypingRef.current = false;
        drainQueue();
      }
    };

    setTimeout(advance, CHAR_MS);
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
        // New phase — append with final text (no typing)
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

    // Stop sparks
    if (sparkTimerRef.current) {
      clearInterval(sparkTimerRef.current);
      sparkTimerRef.current = null;
    }
    stopWeldAudio();

    // Start fade-out
    setFadingOut(true);
    setPhase(PHASE.FADE_OUT);

    // Notify Rust to skip the minimum wait
    tauriRef.current?.invoke("request_skip_splash").catch(() => {});
  }, [stopWeldAudio]);

  // ── Tauri event wiring ───────────────────────────────────────────────────
  useEffect(() => {
    let unlisten = null;
    getTauriApi().then((api) => {
      if (!api) return;
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

  // ── Spark emitter ─────────────────────────────────────────────────────────
  // weldX/weldY in viewport coords — centre of the splash window
  const weldX = 280; // 560/2
  const weldY = 90;  // approx logo-row midpoint from top

  const startSparks = useCallback((rate = 40) => {
    if (sparkTimerRef.current) return;
    const interval = 1000 / rate;
    sparkTimerRef.current = setInterval(() => {
      if (skippedRef.current) {
        clearInterval(sparkTimerRef.current);
        sparkTimerRef.current = null;
        return;
      }
      const count = 1 + Math.floor(Math.random() * 2);
      const batch = Array.from({ length: count }, () => makeSpark(weldX, weldY));
      setSparks((prev) => [...prev.slice(-120), ...batch]); // cap at 120
    }, interval);
  }, [weldX, weldY]);

  const burstSparks = useCallback(() => {
    const burst = Array.from({ length: 30 }, () => makeSpark(weldX, weldY));
    setSparks((prev) => [...prev.slice(-60), ...burst]);
  }, [weldX, weldY]);

  // Remove dead sparks periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setSparks((prev) => prev.slice(-80));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // ── Phase sequencer ───────────────────────────────────────────────────────
  useEffect(() => {
    // Phase 1: Fade-in (0–1 s)
    const t1 = setTimeout(() => {
      setPhase(PHASE.FADE_IN);
      setGridVisible(true);
      setContentVisible(true);
      setTitleVisible(true);
      // Logos slide in
      setTimeout(() => setLogosIn(true), 150);
      setTimeout(() => setTaglineVisible(true), 400);
    }, 50);

    // Phase 2: Sparks begin (1 s)
    const t2 = setTimeout(() => {
      setPhase(PHASE.SPARKS);
      setArcVisible(true);
      startSparks(30);
      playWeldAudio();
    }, 1000);

    // Phase 3: Heavy welding (2 s)
    const t3 = setTimeout(() => {
      setPhase(PHASE.WELDING);
      startSparks(45);
      setJitter(true);
    }, 2000);

    // Phase 4: Clank (6.5 s)
    const t4 = setTimeout(() => {
      setPhase(PHASE.CLANK);
      setJitter(false);
      burstSparks();

      // Stop continuous sparks
      if (sparkTimerRef.current) {
        clearInterval(sparkTimerRef.current);
        sparkTimerRef.current = null;
      }

      // Flash
      setFlash(true);
      setTimeout(() => setFlash(false), 450);

      // Play clank
      stopWeldAudio();
      playClankAudio();

      // Logos scale-bounce
      setClanked(true);
      setTimeout(() => setClanked(false), 500);

      // Arc solidifies
      setArcSolid(true);
      setArcVisible(false);
      setTimeout(() => setWeldLineUp(true), 200);
    }, 6500);

    // Phase 5: Final (7.5 s) — handled by Rust status events
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
      if (sparkTimerRef.current) clearInterval(sparkTimerRef.current);
    };
  }, [startSparks, burstSparks, playWeldAudio, stopWeldAudio, playClankAudio]);

  // ── Render ────────────────────────────────────────────────────────────────
  // Build content class
  let contentClass = "splash-content";
  if (contentVisible) contentClass += " visible";
  if (fadingOut)      contentClass += " fading-out";

  return (
    <div
      className="splash-root"
      onClick={requestSkip}
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {/* Blueprint grid */}
      <div className={`blueprint-grid${gridVisible ? " visible" : ""}`} />

      {/* Vignette */}
      <div className="vignette" />

      {/* Flash overlay */}
      <div className={`flash-overlay${flash ? " flash" : ""}`} />

      {/* Spark layer */}
      <div className="spark-container">
        {sparks.map((s) => (
          <div
            key={s.id}
            className="spark"
            style={{
              left:   s.originX,
              top:    s.originY,
              width:  s.size,
              height: s.size,
              background: s.color,
              boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
              "--vx":       `${s.vx}px`,
              "--vy":       `${s.vy}px`,
              "--duration": `${s.duration}s`,
              "--delay":    `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className={contentClass}>

        {/* Logo row */}
        <div className="logo-row">
          {/* Rust logo */}
          <div className={
            "logo-wrapper rust-logo" +
            (logosIn   ? " slid-in" : "") +
            (jitter    ? " jitter"  : "") +
            (clanked   ? " clanked" : "")
          }>
            <img src={rustLogoUrl} alt="Rust" draggable={false} />
          </div>

          {/* Weld gap */}
          <div className="weld-gap">
            {/* Animated arc SVG */}
            <svg
              className={`weld-arc${arcVisible ? " visible" : ""}${arcSolid ? " solid" : ""}`}
              viewBox="0 0 36 80"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="wg" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#FFC131"/>
                  <stop offset="100%" stopColor="#E05D2B"/>
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {/* Weld arc path */}
              <path
                d="M18 8 Q28 20 22 40 Q16 60 18 72"
                fill="none"
                stroke="url(#wg)"
                strokeWidth="2.5"
                strokeLinecap="round"
                filter="url(#glow)"
                opacity="0.9"
              />
              <path
                d="M18 8 Q10 20 14 40 Q18 60 18 72"
                fill="none"
                stroke="#FFC131"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>

            {/* Solid weld line post-clank */}
            <div className={`weld-line${weldLineUp ? " solidified" : ""}`} />
          </div>

          {/* Tauri logo */}
          <div className={
            "logo-wrapper tauri-logo" +
            (logosIn   ? " slid-in" : "") +
            (jitter    ? " jitter"  : "") +
            (clanked   ? " clanked" : "")
          }>
            <img src={tauriLogoUrl} alt="Tauri" draggable={false} />
          </div>
        </div>

        {/* App title */}
        <div className={`app-title${titleVisible ? " visible" : ""}`}>
          Transmittal Builder
        </div>

        {/* Terminal block */}
        <div className="terminal-block">
          {lines.map((line, i) => {
            const isLast = i === lines.length - 1;
            const showCursor = isLast && !line.done && !skippedRef.current;
            return (
              <div key={line.phase ?? i} className="terminal-line">
                <span className={line.pClass}>{line.prefix}</span>
                <span className={line.mClass}>
                  {line.msg}
                  {showCursor && <span className="cursor" />}
                </span>
              </div>
            );
          })}
          {/* Cursor on empty terminal (before first event arrives) */}
          {lines.length === 0 && phase >= PHASE.WELDING && (
            <div className="terminal-line">
              <span className="prefix-pending">{">"}</span>
              <span className="msg-pending"><span className="cursor" /></span>
            </div>
          )}
        </div>
      </div>

      {/* Tagline */}
      <div className={`tagline${taglineVisible ? " visible" : ""}`}>
        Forged with Rust 🦀 · Powered by Tauri v2
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
