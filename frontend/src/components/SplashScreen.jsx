import { useState, useEffect } from 'react'

function CornerBracket({ pos, delay }) {
  // Each corner is an L-shaped SVG path that draws itself in.
  // Path length for 2 × 40px segments = 80px.
  const paths = {
    tl: 'M 0 40 L 0 0 L 40 0',
    tr: 'M 0 0 L 40 0 L 40 40',
    bl: 'M 0 0 L 0 40 L 40 40',
    br: 'M 40 0 L 40 40 L 0 40',
  }
  return (
    <svg
      className={`splash-bracket splash-bracket--${pos}`}
      width="40" height="40" viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <path
        d={paths[pos]}
        stroke="var(--accent)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="square"
        style={{
          strokeDasharray: 80,
          strokeDashoffset: 80,
          animation: 'splash-bracket-draw 0.55s cubic-bezier(0.4,0,0.2,1) forwards',
          animationDelay: `${delay}ms`,
        }}
      />
    </svg>
  )
}

export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 2500)
    const doneTimer  = setTimeout(onDone, 2900)
    return () => { clearTimeout(leaveTimer); clearTimeout(doneTimer) }
  }, [onDone])

  return (
    <div className={`splash${leaving ? ' splash--leaving' : ''}`} aria-hidden="true">

      {/* Scan line — sweeps top → bottom once */}
      <div className="splash-scan" />

      {/* Corner brackets — draw in staggered */}
      <CornerBracket pos="tl" delay={80} />
      <CornerBracket pos="tr" delay={160} />
      <CornerBracket pos="bl" delay={240} />
      <CornerBracket pos="br" delay={320} />

      {/* Top accent bar */}
      <div className="splash-bar-top" />

      {/* Center content */}
      <div className="splash-center">

        {/* Monogram badge */}
        <div className="splash-badge" style={{ animationDelay: '350ms' }}>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <polygon
              points="22,2 42,12 42,32 22,42 2,32 2,12"
              stroke="var(--accent)" strokeWidth="1.5" fill="none"
            />
            <text
              x="22" y="27"
              textAnchor="middle"
              fill="var(--accent)"
              fontFamily="var(--font-mono)"
              fontSize="13"
              fontWeight="700"
              letterSpacing="0.06em"
            >C19</text>
          </svg>
        </div>

        {/* Wordmark */}
        <div className="splash-wordmark" style={{ animationDelay: '520ms' }}>
          Transmittal Builder
        </div>

        {/* Thin divider */}
        <div className="splash-divider" style={{ animationDelay: '700ms' }} />

        {/* Subtitle */}
        <div className="splash-sub" style={{ animationDelay: '820ms' }}>
          Chamber 19 &nbsp;·&nbsp; Engineering Tools
        </div>
      </div>

      {/* Progress bar */}
      <div className="splash-progress">
        <div className="splash-progress__fill" />
      </div>

      {/* Bottom accent bar */}
      <div className="splash-bar-bottom" />
    </div>
  )
}
