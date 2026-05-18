import { useState, useCallback, useRef, useEffect } from 'react'
import { parseIndex, renderToFolder, zipFolder, getContactGroups, saveContactGroup, deleteContactGroup, checkDuplicateDrawings } from '../api.js'
import CoverSheetPreview from './CoverSheetPreview.jsx'
// Template is embedded on the backend — no upload needed

// ── Filename parsing ─────────────────────────────────────────────
const DOC_ID_RE = /(?:R3P[-–—]\d+[-–—]E\d+[-–—]\d+)/i
function extractDocMeta(filename) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/^.*[/\\]/, '')
  const m = DOC_ID_RE.exec(base)
  if (!m) return { doc_no: '', desc: base.trim(), rev: '' }
  const docNo = m[0].replace(/[–—]/g, '-').toUpperCase().replace(/^R3P-\d+-/, '')
  const remainder = base.slice(m.index + m[0].length).replace(/^[\s\-_–—:;|]+/, '')
  return { doc_no: docNo, desc: remainder.trim(), rev: '' }
}
const docKey = (docNo, desc) => (docNo + '|' + desc).toLowerCase()
const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
function sortDocsAndPdfs(docs, pdfs) {
  const sorted = [...docs].sort((a, b) =>
    _collator.compare(a.doc_no || a.desc || '￿', b.doc_no || b.desc || '￿'))
  const order = new Map(sorted.map((d, i) => [docKey(d.doc_no, d.desc), i]))
  const sortedPdfs = [...pdfs].sort((a, b) => {
    const ma = extractDocMeta(a.name), mb = extractDocMeta(b.name)
    return (order.get(docKey(ma.doc_no, ma.desc)) ?? 1e9) - (order.get(docKey(mb.doc_no, mb.desc)) ?? 1e9)
  })
  return { sortedDocs: sorted, sortedPdfs }
}

// ── Defaults ─────────────────────────────────────────────────────
const DEFAULT_CHECKS = {
  trans_pdf: false, trans_cad: false, trans_originals: false,
  via_email: false, via_ftp: false,
  ci_info: false, ci_approval: false, ci_bid: false, ci_preliminary: false,
  ci_const: false, ci_asbuilt: false, ci_fab: false, ci_record: false, ci_ref: false,
  vr_approved: false, vr_approved_noted: false, vr_rejected: false,
}
const CI_KEYS = ['ci_info', 'ci_approval', 'ci_bid', 'ci_preliminary', 'ci_const', 'ci_asbuilt', 'ci_fab', 'ci_record', 'ci_ref']

let _uid = 0
const uid = () => `_${++_uid}`

// ── Icons ─────────────────────────────────────────────────────────
const Plus    = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>
const X       = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>
const Save    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 13H2.5a1 1 0 01-1-1V2a1 1 0 011-1h7l3 3v8a1 1 0 01-1 1z"/><rect x="4" y="8" width="6" height="4" rx="0.5"/><rect x="4" y="1" width="4" height="3" rx="0.5"/></svg>
const Upload  = () => <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 16V5m0 0L7 9.5M11 5l4 4.5M3 15v2.5A2.5 2.5 0 005.5 20h11a2.5 2.5 0 002.5-2.5V15"/></svg>
const Trash   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0l-.5 8a1 1 0 01-1 1h-5a1 1 0 01-1-1l-.5-8"/></svg>
const Book    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 11V2.5A1.5 1.5 0 013.5 1H12v10H3.5A1.5 1.5 0 002 12.5 1.5 1.5 0 003.5 14H12"/></svg>
const PdfIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 1H3.5A1.5 1.5 0 002 2.5v9A1.5 1.5 0 003.5 13h7a1.5 1.5 0 001.5-1.5V4.5L8.5 1z"/><polyline points="8.5,1 8.5,4.5 12,4.5"/></svg>
const XlIcon  = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700">XL</text></svg>
const DocIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="4.5" fontWeight="700">DOC</text></svg>
const Spin    = () => <svg className="icon-spin" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2a6 6 0 105.3 3.2"/></svg>
const Check   = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,8 6,12 14,4"/></svg>
const Eye     = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ message, type, duration, onDismiss }) {
  if (!message) return null
  const icon = type === 'loading' ? <Spin /> : type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'
  return (
    <div className="tb-toast-wrap">
      <div className={`tb-toast tb-toast--${type}`}>
        <div className="tb-toast__body">
          <span className="tb-toast__icon">{icon}</span>
          <span className="tb-toast__msg">{message}</span>
          {type !== 'loading' && <button className="tb-toast__close" onClick={onDismiss}><X /></button>}
        </div>
        {type !== 'loading' && duration > 0 && (
          <div className="tb-toast__bar" style={{ animationDuration: `${duration}ms` }} />
        )}
      </div>
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = 'Yes, Continue', cancelLabel = 'No, Cancel' }) {
  if (!open) return null
  return (
    <div className="tb-overlay">
      <div className="tb-dialog">
        <div className="tb-dialog__title">{title}</div>
        <div className="tb-dialog__msg">{message}</div>
        <div className="tb-dialog__actions">
          <button className="btn btn--ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn--primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── File chip ─────────────────────────────────────────────────────
function FileChip({ name, type, onRemove }) {
  const cfg = {
    pdf: { cls: 'tb-chip--pdf', icon: <PdfIcon />, label: 'PDF' },
    xl:  { cls: 'tb-chip--xl',  icon: <XlIcon />,  label: 'INDEX' },
    doc: { cls: 'tb-chip--doc', icon: <DocIcon />,  label: 'TEMPLATE' },
  }[type] || {}
  return (
    <div className={`tb-chip ${cfg.cls || ''}`}>
      {cfg.icon}
      <span className="tb-chip__label">{cfg.label}</span>
      <span className="tb-chip__name">{name}</span>
      <button type="button" className="tb-chip__remove" onClick={onRemove}><X /></button>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({ draft, checks, contacts, documents, pdfFiles, indexFile, projectFolderPath, nextXmtlNum, generating, onGenerate }) {
  const filled = [draft.job_num, draft.transmittal_num, draft.client, draft.project_desc, draft.from_name, draft.date, draft.from_title, draft.from_email, draft.from_phone, draft.firm].filter(Boolean).length
  const goodContacts = contacts.filter(c => c.name && c.email).length
  const hasI = !!indexFile, hasP = pdfFiles.length > 0
  const hasTransmitted = checks.trans_pdf || checks.trans_cad || checks.trans_originals
  const hasSentVia = checks.via_email || checks.via_ftp
  const hasCopyIntent = CI_KEYS.some(k => checks[k])

  // Template is always embedded — starts at 17%
  let pct = 17
  if (draft.job_num)         pct += 7
  if (draft.transmittal_num) pct += 7
  if (draft.client)          pct += 5
  if (draft.project_desc)    pct += 5
  if (draft.from_name)       pct += 4
  if (draft.date)            pct += 4
  if (draft.from_title)      pct += 2
  if (draft.from_email)      pct += 3
  if (draft.from_phone)      pct += 2
  if (draft.firm)            pct += 2
  if (goodContacts > 0)      pct += 9
  if (hasTransmitted)        pct += 8
  if (hasSentVia)            pct += 5
  if (hasCopyIntent)         pct += 8
  if (documents.length > 0)  pct += 8
  if (hasI)                  pct += 4
  pct = Math.min(100, pct)

  const canGenerate = documents.length > 0 && !!draft.job_num && !generating

  const trunc = (s, n = 10) => s && s.length > n ? s.slice(0, n) + '…' : (s || '—')
  const xmtlLabel = draft.transmittal_num
    ? `XMTL-${String(parseInt(draft.transmittal_num, 10) || 0).padStart(3, '0')}`
    : '—'

  const drawingVal = hasP
    ? `${pdfFiles.length} PDF${pdfFiles.length !== 1 ? 's' : ''}`
    : documents.length > 0
      ? `${documents.length} row${documents.length !== 1 ? 's' : ''}`
      : 'none'

  const rows = [
    { l: 'Job #',    v: trunc(draft.job_num, 10), ok: !!draft.job_num },
    { l: 'XMTL',    v: xmtlLabel,                 ok: !!draft.transmittal_num },
    { l: 'Drawings', v: drawingVal,                ok: documents.length > 0, err: documents.length === 0 },
  ]

  const missingItems = []
  if (documents.length === 0) missingItems.push('Upload your drawings (PDFs)')
  if (!draft.job_num) missingItems.push('Enter a job number')
  if (!draft.from_name) missingItems.push('Enter your name as the sender')
  if (!hasTransmitted) missingItems.push('Upload what is being transmitted')
  if (goodContacts === 0) missingItems.push('Add recipients from your address book or enter manually')

  return (
    <div className="tb-sidebar">
      {/* Completeness */}
      <div className="card">
        <div className="tb-readiness__header">
          <span className="field__label">Completeness</span>
          <span className={`tb-readiness__pct${pct >= 100 ? ' tb-readiness__pct--ok' : ''}`}>{pct}%</span>
        </div>
        <div className="tb-readiness__track">
          <div className={`tb-readiness__fill${pct >= 100 ? ' tb-readiness__fill--ok' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Package Summary */}
      <div className="card">
        <div className="field__label mb-lg">Package Summary</div>
        <div className="stack stack--8">
          {rows.map(x => (
            <div key={x.l} className="tb-summary-row">
              <span className="text-12 text-muted">{x.l}</span>
              <span className={`tb-badge tb-badge--fixed${x.ok ? ' tb-badge--ok' : x.err ? ' tb-badge--error' : ' tb-badge--dim'}`}>
                {String(x.v)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Output folder path */}
      {projectFolderPath && (
        <div className="tb-path-hint">{projectFolderPath}</div>
      )}

      {/* Complete Transmittal */}
      <div>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          className="btn--full-center"
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          {generating ? <><Spin /> Working…</> : <><Check /> Complete Transmittal</>}
        </button>
        {missingItems.length > 0 && !generating && (
          <div className="tb-missing-list">
            {missingItems.map((item, i) => (
              <div key={i} className="tb-missing-item">{item}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function TransmittalForm({ project, onBack }) {
  const hasContactsFile = (project.contacts?.length ?? 0) > 0

  const [draft, setDraft] = useState({
    job_num:          project.job_num || '',
    transmittal_num:  project.next_xmtl_num || '001',
    date:             new Date().toLocaleDateString('en-US'),
    client:           project.client_site || '',
    project_desc:     '',
    from_name:        '',
    from_title:       '',
    from_email:       '',
    from_phone:       '',
    firm:             '',
  })
  const [checks, setChecks]         = useState({ ...DEFAULT_CHECKS })
  const [contacts, setContacts]     = useState(() => (project.contacts || []).map(c => ({ ...c, id: uid() })))
  const [documents, setDocuments]   = useState([])
  const [indexFile, setIndexFile]   = useState(null)
  const [pdfFiles, setPdfFiles]     = useState([])
  const [indexWarnings, setIndexWarnings] = useState([])
  const [indexLoading, setIndexLoading]   = useState(false)
  const [addressBook, setAddressBook]               = useState([])
  const [addressBookLoading, setAddressBookLoading] = useState(false)
  const [showBook, setShowBook]                     = useState(false)
  const [duplicateWarnings, setDuplicateWarnings]   = useState([])
  const [showPreview, setShowPreview]               = useState(false)
  const [generating, setGenerating] = useState(false)
  const [outputDir, setOutputDir]   = useState(project.output_dir || '')
  const [nextXmtlNum, setNextXmtlNum] = useState(project.next_xmtl_num || null)
  const [existingXmtl, setExistingXmtl] = useState(project.existing_xmtl || [])
  const [toast, setToast]           = useState(null)
  const [confirm, setConfirm]       = useState(null)
  const [result, setResult]         = useState(null)
  const [over, setOver]             = useState(false)
  const inputRef = useRef(null)

  const setField = useCallback((k, v) => setDraft(p => ({ ...p, [k]: v })), [])

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    setToast({ message, type, duration: type !== 'loading' ? duration : 0 })
    if (type !== 'loading') setTimeout(() => setToast(null), duration)
  }, [])

  // ── Contacts ──────────────────────────────────────────────────
  const addContact    = useCallback(() => setContacts(cs => [...cs, { id: uid(), name: '', company: '', email: '', phone: '' }]), [])
  const updateContact = useCallback((id, k, v) => setContacts(cs => cs.map(c => c.id === id ? { ...c, [k]: v } : c)), [])
  const removeContact = useCallback(id => setContacts(cs => cs.filter(c => c.id !== id)), [])

  // ── Address book (DB-backed) ──────────────────────────────────
  const loadAddressBook = useCallback(async () => {
    setAddressBookLoading(true)
    try { const groups = await getContactGroups(); setAddressBook(groups) }
    catch { /* non-fatal */ }
    finally { setAddressBookLoading(false) }
  }, [])

  useEffect(() => { loadAddressBook() }, [loadAddressBook])

  const loadGroup = useCallback(group => {
    setContacts(group.contacts.map(c => ({ ...c, id: uid() })))
    showToast(`Imported "${group.company_name}"`, 'success', 3000)
  }, [showToast])

  const deleteGroup = useCallback(async (groupId, companyName) => {
    try {
      await deleteContactGroup(groupId)
      setAddressBook(prev => prev.filter(g => g.id !== groupId))
      showToast(`Deleted "${companyName}"`, 'info', 3000)
    } catch (e) { showToast(`Delete failed: ${e.message}`, 'error', 4000) }
  }, [showToast])

  const saveCurrentContacts = useCallback(async () => {
    const valid = contacts.filter(c => c.name || c.email)
    if (!valid.length) { showToast('No contacts to save', 'error', 3000); return }
    const companyName = contacts.find(c => c.company)?.company || draft.client || draft.job_num || 'Contacts'
    try {
      await saveContactGroup({ company_name: companyName, contacts: valid })
      await loadAddressBook()
      showToast(`Saved "${companyName}" to address book`, 'success', 3000)
    } catch (e) { showToast(`Save failed: ${e.message}`, 'error', 4000) }
  }, [contacts, draft.client, draft.job_num, loadAddressBook, showToast])

  // ── Documents ─────────────────────────────────────────────────
  const addDoc    = useCallback(() => setDocuments(ds => [...ds, { id: uid(), doc_no: '', desc: '', rev: '' }]), [])
  const updateDoc = useCallback((id, k, v) => setDocuments(ds => ds.map(d => d.id === id ? { ...d, [k]: v } : d)), [])
  const removeDoc = useCallback(id => setDocuments(ds => ds.filter(d => d.id !== id)), [])
  const clearAll  = useCallback(() => {
    setDocuments([]); setPdfFiles([]); setIndexFile(null); setIndexWarnings([]); setDuplicateWarnings([])
    showToast('All documents cleared', 'info', 3000)
  }, [showToast])

  // ── Checks ────────────────────────────────────────────────────
  const toggleCheck = useCallback(k => {
    if (CI_KEYS.includes(k)) {
      setChecks(p => {
        if (p[k]) return { ...p, [k]: false }
        const next = { ...p }
        CI_KEYS.forEach(c => { next[c] = false })
        next[k] = true
        return next
      })
    } else {
      setChecks(p => ({ ...p, [k]: !p[k] }))
    }
  }, [])

  // ── Parse index ───────────────────────────────────────────────
  const doParseIndex = useCallback(async file => {
    setIndexLoading(true); setIndexWarnings([])
    try {
      const data = await parseIndex(file)
      if (data.warnings?.length) setIndexWarnings(data.warnings)
      const revMap = new Map()
      for (const d of (data.documents || [])) {
        const key = docKey(d.doc_no, d.desc)
        if (key) revMap.set(key, d.rev || '')
      }
      let matched = 0
      setDocuments(prev => prev.map(d => {
        const key = docKey(d.doc_no, d.desc)
        if (revMap.has(key)) { matched++; return { ...d, rev: revMap.get(key) || d.rev } }
        return d
      }))
      const count = matched
      showToast(count > 0 ? `Revisions applied to ${count} rows` : 'Index loaded — no matching rows yet', 'success', 5000)
    } catch (e) {
      showToast(`Index parse failed: ${e.message}`, 'error', 6000)
    } finally { setIndexLoading(false) }
  }, [showToast])

  // ── Smart file router ─────────────────────────────────────────
  const onFileDrop = useCallback(files => {
    const newPdfs = []
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase()
      if (ext === 'xlsx' || ext === 'xls') { setIndexFile(f); doParseIndex(f) }
      else if (ext === 'pdf') newPdfs.push(f)
    }
    if (newPdfs.length > 0) {
      setDocuments(prev => {
        const existing = new Set(prev.map(d => docKey(d.doc_no, d.desc)))
        const toAdd = []
        for (const f of newPdfs) {
          const meta = extractDocMeta(f.name)
          const key = docKey(meta.doc_no, meta.desc)
          if (!existing.has(key)) { toAdd.push({ id: uid(), ...meta }); existing.add(key) }
        }
        return [...prev, ...toAdd].sort((a, b) =>
          _collator.compare(a.doc_no || a.desc || '￿', b.doc_no || b.desc || '￿'))
      })
      setPdfFiles(prev => {
        const toAdd = newPdfs.filter(f => !prev.some(p => p.name === f.name))
        return [...prev, ...toAdd].sort((a, b) => {
          const ma = extractDocMeta(a.name), mb = extractDocMeta(b.name)
          return _collator.compare(ma.doc_no || ma.desc || '￿', mb.doc_no || mb.desc || '￿')
        })
      })
      showToast(`${newPdfs.length} PDF${newPdfs.length !== 1 ? 's' : ''} added`, 'success', 3000)

      // Duplicate detection — fire-and-forget, never blocks the drop
      const projectPath = project.output_dir
      if (projectPath) {
        const docNos = newPdfs.map(f => extractDocMeta(f.name).doc_no).filter(Boolean)
        if (docNos.length) {
          checkDuplicateDrawings(projectPath, docNos)
            .then(dupes => { if (dupes.length) setDuplicateWarnings(dupes) })
            .catch(() => {})
        }
      }
    }
  }, [doParseIndex, showToast, project])

  const removePdf = useCallback(name => {
    setPdfFiles(p => p.filter(f => f.name !== name))
    const meta = extractDocMeta(name)
    setDocuments(p => p.filter(d => docKey(d.doc_no, d.desc) !== docKey(meta.doc_no, meta.desc)))
    setDuplicateWarnings(prev => prev.filter(w => w.doc_no !== meta.doc_no))
  }, [])

  // ── Next XMTL ─────────────────────────────────────────────────
  const handleNextXmtl = useCallback(() => {
    if (!nextXmtlNum) return
    setConfirm({
      title: 'Start Fresh Session?',
      message: `Moving to XMTL-${nextXmtlNum}. Clear current form data and start fresh, or just update the number?`,
      confirmLabel: 'Start Fresh',
      cancelLabel: 'Keep Data & Update',
      onConfirm: () => {
        setConfirm(null)
        setField('transmittal_num', nextXmtlNum)
        setDocuments([]); setPdfFiles([]); setIndexFile(null)
        setChecks({ ...DEFAULT_CHECKS }); setIndexWarnings([])
        showToast(`Starting fresh for XMTL-${nextXmtlNum}`, 'success', 3000)
      },
      onCancel: () => {
        setConfirm(null)
        setField('transmittal_num', nextXmtlNum)
        showToast(`Updated to XMTL-${nextXmtlNum}`, 'success', 3000)
      },
    })
  }, [nextXmtlNum, setField, showToast])

  // ── Generate ──────────────────────────────────────────────────
  const doGenerate = useCallback(async () => {
    setGenerating(true); setResult(null)
    const { sortedDocs, sortedPdfs } = sortDocsAndPdfs(documents, pdfFiles)
    const fields = {
      date: draft.date, job_num: draft.job_num, transmittal_num: draft.transmittal_num,
      client: draft.client, project_desc: draft.project_desc, from_name: draft.from_name,
      from_title: draft.from_title, from_email: draft.from_email, from_phone: draft.from_phone, firm: draft.firm,
    }
    const cleanContacts = contacts.filter(c => c.name || c.email).map(({ name, company, email, phone }) => ({ name, company, email, phone }))
    const cleanDocs = sortedDocs.map(d => ({ doc_no: d.doc_no, desc: d.desc, rev: d.rev }))

    showToast('Writing transmittal to project folder…', 'loading')
    try {
      // 1. Save to server folder
      const data = await renderToFolder({
        fields, checks, contacts: cleanContacts,
        documents: cleanDocs, outputDir: outputDir.trim() || project.output_dir, pdfs: sortedPdfs,
      })
      if (data.next_xmtl_num) setNextXmtlNum(data.next_xmtl_num)
      if (data.xmtl_folder_name) setExistingXmtl(prev => [...new Set([...prev, data.xmtl_folder_name])])

      // 2. Zip the folder for email attachment
      showToast('Preparing email package…', 'loading')
      try {
        const res = await zipFolder(data.xmtl_folder)
        const blob = await res.blob()
        const zipName = `${data.xmtl_folder_name}.zip`
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = zipName
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showToast(`✓ ${data.xmtl_folder_name} saved · ZIP downloaded for email`, 'success', 10000)
        setResult({ folder: data.xmtl_folder_name, path: data.xmtl_folder, files: data.files_written, nextNum: data.next_xmtl_num, zipName })
      } catch {
        // ZIP failed but folder save succeeded — still a success
        showToast(`✓ Saved to ${data.xmtl_folder_name}`, 'success', 8000)
        setResult({ folder: data.xmtl_folder_name, path: data.xmtl_folder, files: data.files_written, nextNum: data.next_xmtl_num })
      }
    } catch (e) {
      showToast(`Failed: ${e.message}`, 'error', 8000)
    } finally { setGenerating(false) }
  }, [documents, pdfFiles, draft, checks, contacts, outputDir, project.output_dir, showToast])

  const handleGenerate = useCallback(() => {
    if (nextXmtlNum) {
      const cur = parseInt(draft.transmittal_num, 10), nxt = parseInt(nextXmtlNum, 10)
      if (!isNaN(cur) && !isNaN(nxt) && cur < nxt) {
        setConfirm({
          title: 'Overwrite Existing Transmittal?',
          message: `XMTL-${String(cur).padStart(3, '0')} already exists in the project folder. Completing this transmittal will overwrite those files.`,
          confirmLabel: 'Yes, Overwrite',
          onConfirm: () => { setConfirm(null); doGenerate() },
          onCancel: () => setConfirm(null),
        })
        return
      }
    }
    doGenerate()
  }, [doGenerate, nextXmtlNum, draft.transmittal_num])

  const prevent = e => { e.preventDefault(); e.stopPropagation() }
  const hasAnything = documents.length > 0 || pdfFiles.length > 0 || !!indexFile

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Breadcrumb */}
      <div className="tb-breadcrumb">
        <button type="button" className="tb-breadcrumb__link" onClick={onBack}>Projects</button>
        <span className="tb-breadcrumb__sep">/</span>
        <span>New Transmittal</span>
        {draft.job_num && <><span className="tb-breadcrumb__sep">/</span><span className="tb-breadcrumb__accent">{draft.job_num}</span></>}
        {draft.transmittal_num && <><span className="tb-breadcrumb__sep">/</span><span className="tb-breadcrumb__ok">XMTL-{String(parseInt(draft.transmittal_num, 10) || 0).padStart(3, '0')}</span></>}
        <button type="button" className={`btn btn--ghost btn--sm tb-preview-toggle${showPreview ? ' tb-preview-toggle--active' : ''}`} onClick={() => setShowPreview(v => !v)}>
          <Eye /> {showPreview ? 'Hide Preview' : 'Preview'}
        </button>
      </div>

      <div className="tb-layout">
        <div className="tb-main stack stack--20">

          {/* Project Information */}
          <div className="section">
            <div className="section__header"><h3>Project Information</h3></div>
            <div className="section__body stack stack--12">
              <div className="grid-4">
                <div className="field">
                  <label className="field__label field__label--required">Job Number</label>
                  <input type="text" value={draft.job_num} onChange={e => setField('job_num', e.target.value)} placeholder="XXXX" className="mono" />
                </div>
                <div className="field">
                  <label className="field__label field__label--required">Transmittal No.</label>
                  <div className="row-c-4">
                    <input type="text" value={draft.transmittal_num} onChange={e => setField('transmittal_num', e.target.value)} placeholder="001" style={{ fontFamily: 'var(--font-mono)', flex: 1, minWidth: 0 }} />
                    {nextXmtlNum && draft.transmittal_num !== nextXmtlNum && (
                      <button type="button" className="tb-next-btn" onClick={handleNextXmtl} title={`Jump to next: ${nextXmtlNum}`}>Next: {nextXmtlNum}</button>
                    )}
                  </div>
                  {(() => {
                    const padded = String(parseInt(draft.transmittal_num, 10) || 0).padStart(3, '0')
                    const key = `XMTL-${padded}`
                    const conflict = existingXmtl.some(x => x.toUpperCase() === key.toUpperCase())
                    return conflict ? (
                      <div className="tb-xmtl-warn">
                        ⚠ {key} already exists — completing will overwrite those files.
                      </div>
                    ) : null
                  })()}
                </div>
                <div className="field">
                  <label className="field__label field__label--required">Date</label>
                  <input type="text" value={draft.date} onChange={e => setField('date', e.target.value)} placeholder="MM/DD/YYYY" className="mono" />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field__label">Client / Site</label>
                  <input type="text" value={draft.client} onChange={e => setField('client', e.target.value)} placeholder="Client Name — Site Name" />
                </div>
                <div className="field">
                  <label className="field__label">Project Description</label>
                  <input type="text" value={draft.project_desc} onChange={e => setField('project_desc', e.target.value)} placeholder="180MW BESS Substation" />
                </div>
              </div>
            </div>
          </div>

          {/* Sender */}
          <div className="section">
            <div className="section__header"><h3>Sender</h3></div>
            <div className="section__body stack stack--12">
              <div className="grid-2">
                <div className="field">
                  <label className="field__label field__label--required">Name</label>
                  <input type="text" value={draft.from_name} onChange={e => setField('from_name', e.target.value)} placeholder="Full name" autoComplete="name" />
                </div>
                <div className="field">
                  <label className="field__label">Title</label>
                  <input type="text" value={draft.from_title} onChange={e => setField('from_title', e.target.value)} placeholder="Title / Role" />
                </div>
              </div>
              <div className="grid-3">
                <div className="field">
                  <label className="field__label">Email</label>
                  <input type="email" value={draft.from_email} onChange={e => setField('from_email', e.target.value)} placeholder="email@company.com" />
                </div>
                <div className="field">
                  <label className="field__label">Phone</label>
                  <input type="tel" value={draft.from_phone} onChange={e => setField('from_phone', e.target.value)} placeholder="(XXX) XXX-XXXX" />
                </div>
                <div className="field">
                  <label className="field__label">Firm Registration</label>
                  <input type="text" value={draft.firm} onChange={e => setField('firm', e.target.value)} placeholder="TX FIRM #XXXXX" className="mono" />
                </div>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="section">
            <div className="section__header"><h3>Transmittal Options</h3></div>
            <div className="section__body">
              <div className="grid-2" style={{ gap: 20 }}>
                <div className="stack stack--16">
                  {[
                    { label: 'Transmitted', keys: [['trans_pdf','PDF'],['trans_cad','CAD'],['trans_originals','Originals']] },
                    { label: 'Sent Via',    keys: [['via_email','Email'],['via_ftp','FTP']] },
                    { label: 'Vendor Response', keys: [['vr_approved','Approved'],['vr_approved_noted','Approved as Noted'],['vr_rejected','Rejected']] },
                  ].map(g => (
                    <div key={g.label}>
                      <div className="field__label mb-sm">{g.label}</div>
                      <div className="check-group">
                        {g.keys.map(([k, l]) => (
                          <label key={k} className={`check-pill${checks[k] ? ' check-pill--active' : ''}`}>
                            <input type="checkbox" checked={checks[k]} onChange={() => toggleCheck(k)} />{l}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="field__label mb-sm">Transmittal Type / Intent</div>
                  <div className="check-group">
                    {[
                      ['ci_approval','For Approval'], ['ci_const','For Construction'], ['ci_preliminary','For Preliminary'],
                      ['ci_info','For Information'], ['ci_bid','For Bid'], ['ci_asbuilt','For As-Built'],
                      ['ci_fab','For Fabrication'], ['ci_record','For Record'], ['ci_ref','For Reference'],
                    ].map(([k, l]) => (
                      <label key={k} className={`check-pill${checks[k] ? ' check-pill--active' : ''}`}>
                        <input type="checkbox" checked={checks[k]} onChange={() => toggleCheck(k)} />{l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div className="section">
            <div className="section__header">
              <h3>Contacts</h3>
              <div className="row row--8">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowBook(v => !v)}>
                  <Book /> Address Book {addressBook.length > 0 && <span className="tb-badge tb-badge--dim" style={{ marginLeft: 2 }}>{addressBook.length}</span>}
                </button>
                {contacts.filter(c => c.name || c.email).length > 0 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={saveCurrentContacts}><Save /> Save</button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={addContact}><Plus /> Add</button>
              </div>
            </div>

            {showBook && (
              <div className="tb-address-card">
                <div className="field__label mb-md">Address Book</div>
                {addressBookLoading ? (
                  <div className="text-12 text-dim"><Spin /> Loading…</div>
                ) : addressBook.length === 0 ? (
                  <div className="text-12 text-dim" style={{ fontStyle: 'italic' }}>No saved companies. Add contacts and click Save.</div>
                ) : (
                  <div className="stack stack--6">
                    {addressBook.map(group => (
                      <div key={group.id} className="tb-list-row">
                        <span className="text-13">{group.company_name}</span>
                        <span className="tb-badge tb-badge--dim">{group.contacts.length}</span>
                        <div className="row-auto-4">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => loadGroup(group)}>Import</button>
                          <button type="button" className="btn btn--danger btn--sm btn--xs-clean" onClick={() => deleteGroup(group.id, group.company_name)}><Trash /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {contacts.length === 0 ? (
              <div className="tb-contacts-empty">
                {hasContactsFile ? (
                  'All contacts removed. Use Add to add recipients.'
                ) : (
                  <>
                    No contacts file detected for this project.{' '}
                    <button type="button" className="tb-inline-link" onClick={addContact}>Add a recipient</button>
                    {' '}to get started, or import from the address book.
                  </>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th style={{ width: 36 }}></th></tr></thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id}>
                        <td><input type="text" value={c.name} onChange={e => updateContact(c.id, 'name', e.target.value)} placeholder="Name" className="w-full" /></td>
                        <td><input type="text" value={c.company} onChange={e => updateContact(c.id, 'company', e.target.value)} placeholder="Company" className="w-full" /></td>
                        <td><input type="email" value={c.email} onChange={e => updateContact(c.id, 'email', e.target.value)} placeholder="email@example.com" className="w-full" /></td>
                        <td><input type="tel" value={c.phone} onChange={e => updateContact(c.id, 'phone', e.target.value)} placeholder="Phone" className="w-full" /></td>
                        <td><button type="button" className="btn btn--danger btn--sm btn--xs" onClick={() => removeContact(c.id)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="section">
            <div className="section__header">
              <h3>Documents</h3>
              <div className="row row--8">
                {hasAnything && <button type="button" className="btn btn--ghost btn--sm text-error" onClick={clearAll}><Trash /> Clear All</button>}
                <button type="button" className="btn btn--ghost btn--sm" onClick={addDoc}><Plus /> Add Row</button>
              </div>
            </div>
            <div className="section__body stack stack--12">
              <div
                className={`tb-dropzone${over ? ' tb-dropzone--over' : ''}`}
                onDragOver={e => { prevent(e); setOver(true) }}
                onDragLeave={e => { prevent(e); setOver(false) }}
                onDrop={e => { prevent(e); setOver(false); onFileDrop([...e.dataTransfer.files]) }}
                onClick={() => inputRef.current?.click()}
              >
                <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls" className="is-hidden"
                  onChange={e => { onFileDrop([...e.target.files]); e.target.value = '' }} />
                <div className="tb-dropzone__icon">{indexLoading ? <Spin /> : <Upload />}</div>
                <div className="tb-dropzone__text">{indexLoading ? 'Reading drawing index…' : 'Click to browse or drag and drop files here'}</div>
                <div className="tb-dropzone__hint">PDFs → source drawings · Excel → revision lookup (read-only)</div>
              </div>

              {(indexFile || pdfFiles.length > 0) && (
                <div className="tb-chips">
                  {indexFile && <FileChip name={indexFile.name} type="xl" onRemove={() => { setIndexFile(null); setIndexWarnings([]) }} />}
                  {pdfFiles.map(f => <FileChip key={f.name} name={f.name} type="pdf" onRemove={() => removePdf(f.name)} />)}
                </div>
              )}

              {duplicateWarnings.length > 0 && (
                <div className="tb-dupe-warn">
                  <div className="tb-dupe-warn__head">
                    ⚠ {duplicateWarnings.length} drawing{duplicateWarnings.length !== 1 ? 's' : ''} previously transmitted
                  </div>
                  {duplicateWarnings.map((w, i) => (
                    <div key={i} className="tb-dupe-item">
                      <span className="tb-dupe-item__no">{w.doc_no}</span>
                      <span className="tb-dupe-item__detail">
                        last sent in <strong>{w.xmtl_num}</strong>
                        {w.xmtl_date ? ` on ${w.xmtl_date}` : ''}
                        {w.prev_rev ? ` — Rev ${w.prev_rev}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {indexWarnings.length > 0 && (
                <div className="notice notice--warning">{indexWarnings.join(' · ')}</div>
              )}

              {documents.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  Drop PDFs to auto-populate, use Add Row for manual entries, or drop an Excel index to apply revisions.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th style={{ width: '28%' }}>Doc No.</th>
                      <th>Description</th>
                      <th style={{ width: 70 }}>Rev</th>
                      <th style={{ width: 36 }}></th>
                    </tr></thead>
                    <tbody>
                      {documents.map(d => (
                        <tr key={d.id}>
                          <td><input type="text" value={d.doc_no} onChange={e => updateDoc(d.id, 'doc_no', e.target.value)} placeholder="E0-001" className="input--mono" /></td>
                          <td><input type="text" value={d.desc} onChange={e => updateDoc(d.id, 'desc', e.target.value)} placeholder="Description" className="w-full" /></td>
                          <td><input type="text" value={d.rev} onChange={e => updateDoc(d.id, 'rev', e.target.value)} placeholder="—" style={{ width: '100%', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }} /></td>
                          <td><button type="button" className="btn btn--ghost btn--sm btn--xs text-dim" onClick={() => removeDoc(d.id)}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="notice notice--success stack stack--8">
              <div><strong>{result.folder}</strong> created successfully.</div>
              <div className="mono text-12" style={{ wordBreak: 'break-all' }}>{result.path}</div>
              <div className="text-12">
                {result.files.length} file{result.files.length !== 1 ? 's' : ''} written · next XMTL: <strong>{result.nextNum}</strong>
                {result.zipName && <> · <strong>{result.zipName}</strong> downloaded for email</>}
              </div>
            </div>
          )}

        </div>

        <Sidebar
          draft={draft}
          checks={checks}
          contacts={contacts}
          documents={documents}
          pdfFiles={pdfFiles}
          indexFile={indexFile}
          projectFolderPath={outputDir || project.output_dir}
          nextXmtlNum={nextXmtlNum}
          generating={generating}
          onGenerate={handleGenerate}
        />
      </div>

      <footer className="tb-footer">
        <span>Transmittal Builder</span>
        <span>© 2026 Chamber 19</span>
      </footer>

      <Toast message={toast?.message} type={toast?.type} duration={toast?.duration} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={!!confirm} title={confirm?.title} message={confirm?.message}
        onConfirm={confirm?.onConfirm} onCancel={confirm?.onCancel || (() => setConfirm(null))}
        confirmLabel={confirm?.confirmLabel} cancelLabel={confirm?.cancelLabel}
      />

      {/* ── Cover Sheet Preview overlay ── */}
      {showPreview && (
        <div className="tb-preview-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPreview(false) }}>
          <div className="tb-preview-panel">
            <div className="tb-preview-panel__header">
              <span>Cover Sheet Preview</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowPreview(false)}><X /></button>
            </div>
            <div className="tb-preview-panel__body">
              <CoverSheetPreview
                draft={draft}
                checks={checks}
                contacts={contacts.filter(c => c.name || c.email)}
                documents={documents}
                pdfFiles={pdfFiles}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
