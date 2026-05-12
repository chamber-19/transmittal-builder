import { useState, useCallback, useEffect, useMemo } from 'react'
import { scanProjects, scanFolder, getRecentProjects, touchProject, removeRecentProject } from '../api.js'

const DEFAULT_PROJECTS_ROOT = 'G:\\Shared drives\\Root 3 Power\\02-ACTIVE PROJECTS'

// ── Project loading overlay ──────────────────────────────────────
const LOAD_STAGES = [
  { at: 0,    label: 'Opening project…' },
  { at: 420,  label: 'Scanning transmittal history…' },
  { at: 900,  label: 'Loading project data…' },
  { at: 1400, label: 'Almost ready…' },
]

function ProjectLoadingOverlay({ meta }) {
  const [stageIdx, setStageIdx] = useState(0)

  useEffect(() => {
    const timers = LOAD_STAGES.slice(1).map((stage, i) =>
      setTimeout(() => setStageIdx(i + 1), stage.at)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="pl-overlay">
      <div className="pl-card">
        <div className="pl-spinner" />
        <div className="pl-label">Opening Project</div>
        {meta?.job_num && <div className="pl-job">{meta.job_num}</div>}
        {meta?.client_site && <div className="pl-name">{meta.client_site}</div>}
        <div className="pl-status" key={stageIdx}>{LOAD_STAGES[stageIdx].label}</div>
      </div>
    </div>
  )
}

// ── Project row ──────────────────────────────────────────────────
function ProjectRow({ p, isRecent, opening, onOpen, onDelete, isDeveloper }) {
  const isOpening = opening === p.path
  return (
    <div
      className={`pp-row${isOpening ? ' pp-row--opening' : ''}`}
      onClick={() => onOpen(p.path, p)}
      role="button"
      tabIndex={opening ? -1 : 0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(p.path, p) }}
    >
      <div className="pp-row__main">
        <span className="pp-row__job">{p.job_num || p.path.split('\\').pop()}</span>
        {p.client_site && <span className="pp-row__client">{p.client_site}</span>}
      </div>
      <div className="pp-row__meta">
        {!isRecent && p.existing_xmtl?.length > 0 && (
          <span className="pp-badge pp-badge--dim">{p.existing_xmtl.length} xmtl</span>
        )}
        {!isRecent && p.has_template && <span className="pp-badge pp-badge--info">template</span>}
        {!isRecent && p.has_contacts && <span className="pp-badge pp-badge--ok">contacts</span>}
        {isRecent && p.opened_by && (
          <span className="pp-badge pp-badge--dim">{p.opened_by}</span>
        )}
        {isRecent && p.next_xmtl_num && (
          <span className="pp-badge pp-badge--dim">next {p.next_xmtl_num}</span>
        )}
        {isRecent && isDeveloper && onDelete && (
          <button
            type="button"
            className="pp-row__delete"
            onClick={e => { e.stopPropagation(); onDelete(p.path) }}
            title="Remove from recent"
          >×</button>
        )}
        {isOpening
          ? <span className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
          : <span className="pp-row__arrow">→</span>
        }
      </div>
    </div>
  )
}

// ── Main picker ──────────────────────────────────────────────────
export default function ProjectPicker({ onSelect, isDeveloper }) {
  const [query, setQuery] = useState('')
  const [allProjects, setAllProjects] = useState([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(null)
  const [recent, setRecent] = useState([])
  const [opening, setOpening] = useState(null)
  const [openingMeta, setOpeningMeta] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRecentProjects()
      .then(data => setRecent(data.projects || []))
      .catch(() => {})

    scanProjects(DEFAULT_PROJECTS_ROOT, '')
      .then(data => setAllProjects(data.projects || []))
      .catch(e => setIndexError(e.message))
      .finally(() => setIndexLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allProjects
    return allProjects.filter(p =>
      p.job_num.toLowerCase().includes(q) ||
      (p.client_site || '').toLowerCase().includes(q)
    )
  }, [query, allProjects])

  const showRecent = !query.trim() && recent.length > 0

  const handleOpen = useCallback(async (folderPath, meta = null) => {
    if (opening) return
    setOpening(folderPath)
    setOpeningMeta(meta)
    setError(null)
    const start = Date.now()
    try {
      const result = await scanFolder(folderPath)
      touchProject({
        path: folderPath,
        job_num: result.job_num || meta?.job_num || '',
        client_site: result.client_site || meta?.client_site || '',
        next_xmtl_num: result.next_xmtl_num || '',
      }).catch(() => {})
      const elapsed = Date.now() - start
      const remaining = 2000 - elapsed
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining))
      onSelect(result)
    } catch (e) {
      setError(`Could not open project: ${e.message}`)
      setOpening(null)
      setOpeningMeta(null)
    }
  }, [opening, onSelect])

  const handleDeleteRecent = useCallback(async (path) => {
    try {
      await removeRecentProject(path)
      setRecent(r => r.filter(p => p.path !== path))
    } catch {
      // silently fail — registry may already be stale
    }
  }, [])

  return (
    <div className="pp-container">
      {opening && <ProjectLoadingOverlay meta={openingMeta} />}

      {/* Top row: title + search */}
      <div className="pp-top-row">
        <h1 className="pp-page-title">Projects</h1>
        <div className="pp-search-wrap">
          <svg className="pp-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="pp-search"
            placeholder="Search by job number or project name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {error && <div className="notice notice--error" style={{ marginTop: 8 }}>{error}</div>}

      {/* Recent section */}
      {showRecent && (
        <>
          <div className="pp-section-label">Recent Projects</div>
          <div className="pp-results">
            {recent.map(p => (
              <ProjectRow
                key={p.path}
                p={p}
                isRecent
                opening={opening}
                onOpen={handleOpen}
                onDelete={handleDeleteRecent}
                isDeveloper={isDeveloper}
              />
            ))}
          </div>
        </>
      )}

      {/* All projects section */}
      <div className="pp-section-label">
        {indexLoading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" style={{ width: 12, height: 12 }} />
            Indexing active projects…
          </span>
        ) : indexError ? (
          'Could not load project index'
        ) : query.trim() ? (
          `${filtered.length} project${filtered.length !== 1 ? 's' : ''} matching "${query}"`
        ) : (
          `${filtered.length} active project${filtered.length !== 1 ? 's' : ''}`
        )}
      </div>

      {indexError && <div className="notice notice--error">{indexError}</div>}

      <div className="pp-results">
        {filtered.map(p => (
          <ProjectRow key={p.path} p={p} isRecent={false} opening={opening} onOpen={handleOpen} />
        ))}
        {!indexLoading && !indexError && filtered.length === 0 && (
          <div className="pp-empty">
            {query.trim()
              ? <>No projects match <strong>"{query}"</strong> — use <strong>New Project Transmittal</strong> to browse to a specific folder.</>
              : 'No projects found in the active projects folder.'}
          </div>
        )}
      </div>

    </div>
  )
}
