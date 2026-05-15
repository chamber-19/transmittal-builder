/**
 * CoverSheetPreview — live HTML preview of the R3P transmittal cover sheet.
 *
 * Mirrors the layout of R3P-PRJ#-XMTL-001 - DOCUMENT INDEX.docx exactly as
 * far as field positions and checkbox states go.  Rendered purely from React
 * props — no backend round-trip — so it updates on every keystroke.
 */

const CI_LABELS = [
  ['ci_approval',    'For Approval'],
  ['ci_const',       'For Construction'],
  ['ci_preliminary', 'For Preliminary'],
  ['ci_info',        'For Information'],
  ['ci_bid',         'For Bid'],
  ['ci_asbuilt',     'For As-Built'],
  ['ci_fab',         'For Fabrication'],
  ['ci_record',      'For Record'],
  ['ci_ref',         'For Reference'],
]

function Box({ checked, label }) {
  return (
    <span className="csp-check">
      <span className="csp-check__glyph">{checked ? '☒' : '☐'}</span>
      <span className="csp-check__label">{label}</span>
    </span>
  )
}

function SectionHead({ children }) {
  return <div className="csp-section-head">{children}</div>
}

export default function CoverSheetPreview({ draft, checks, contacts, documents, pdfFiles }) {
  const jobLabel = draft.job_num
    ? (draft.job_num.toUpperCase().startsWith('R3P-') ? draft.job_num : `R3P-${draft.job_num}`)
    : 'R3P-<PRJ#>'

  const xmtlLabel = draft.transmittal_num
    ? `XMTL-${String(parseInt(draft.transmittal_num, 10) || 0).padStart(3, '0')}`
    : 'XMTL-<###>'

  const activeCI = CI_LABELS.find(([k]) => checks[k])

  const hasDrawings = pdfFiles.length > 0 || documents.length > 0

  return (
    <div className="csp-page" aria-label="Cover sheet preview">

      {/* ── Letterhead ── */}
      <div className="csp-letterhead">
        <div className="csp-letterhead__name">ROOT 3 POWER ENGINEERING, INC.</div>
        <div className="csp-letterhead__sub">TRANSMITTAL</div>
      </div>

      {/* ── Job / XMTL / Date ── */}
      <div className="csp-meta-row">
        <div className="csp-meta-cell">
          <span className="csp-label">Job No.</span>
          <span className="csp-value csp-mono">{jobLabel}</span>
        </div>
        <div className="csp-meta-cell">
          <span className="csp-label">Transmittal</span>
          <span className="csp-value csp-mono">{xmtlLabel}</span>
        </div>
        <div className="csp-meta-cell">
          <span className="csp-label">Date</span>
          <span className="csp-value">{draft.date || '—'}</span>
        </div>
      </div>

      {/* ── To / Project ── */}
      <div className="csp-block">
        <div className="csp-field-row">
          <span className="csp-field-key">To</span>
          <span className="csp-field-val">{draft.client || <em className="csp-empty">&lt;CLIENT&gt; — &lt;SITE NAME&gt;</em>}</span>
        </div>
        <div className="csp-field-row">
          <span className="csp-field-key">Re</span>
          <span className="csp-field-val">{draft.project_desc || <em className="csp-empty">&lt;PROJECT DESCRIPTION&gt;</em>}</span>
        </div>
      </div>

      {/* ── From ── */}
      <div className="csp-block">
        <SectionHead>FROM</SectionHead>
        <div className="csp-from-grid">
          <span className="csp-field-val csp-bold">{draft.from_name || <em className="csp-empty">Name</em>}</span>
          <span className="csp-field-val csp-muted">{draft.from_title || <em className="csp-empty">Title</em>}</span>
          {draft.from_email && <span className="csp-field-val">e: {draft.from_email}</span>}
          {draft.from_phone && <span className="csp-field-val">c: {draft.from_phone}</span>}
          {draft.firm       && <span className="csp-field-val csp-mono" style={{ gridColumn: '1/-1' }}>{draft.firm}</span>}
        </div>
      </div>

      {/* ── Checkboxes ── */}
      <div className="csp-block">
        <SectionHead>TRANSMITTAL OPTIONS</SectionHead>

        <div className="csp-check-group">
          <span className="csp-check-group__label">We Are Transmitting</span>
          <Box checked={checks.trans_pdf}       label="PDF" />
          <Box checked={checks.trans_cad}       label="CAD" />
          <Box checked={checks.trans_originals} label="Originals" />
        </div>

        <div className="csp-check-group">
          <span className="csp-check-group__label">Sent Via</span>
          <Box checked={checks.via_email} label="Email" />
          <Box checked={checks.via_ftp}   label="FTP" />
        </div>

        <div className="csp-check-group">
          <span className="csp-check-group__label">Intent</span>
          {CI_LABELS.map(([k, l]) => <Box key={k} checked={checks[k]} label={l} />)}
        </div>

        <div className="csp-check-group">
          <span className="csp-check-group__label">Vendor Response</span>
          <Box checked={checks.vr_approved}       label="Approved" />
          <Box checked={checks.vr_approved_noted} label="Approved as Noted" />
          <Box checked={checks.vr_rejected}       label="Rejected" />
        </div>
      </div>

      {/* ── Contacts ── */}
      {contacts.filter(c => c.name || c.email).length > 0 && (
        <div className="csp-block">
          <SectionHead>CONTACTS</SectionHead>
          <table className="csp-table">
            <thead>
              <tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th></tr>
            </thead>
            <tbody>
              {contacts.filter(c => c.name || c.email).map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td>{c.company}</td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Document index ── */}
      {documents.length > 0 && (
        <div className="csp-block">
          <SectionHead>DOCUMENT INDEX</SectionHead>
          <table className="csp-table">
            <thead>
              <tr><th>Document No.</th><th>Description</th><th>Rev</th></tr>
            </thead>
            <tbody>
              {documents.map((d, i) => (
                <tr key={i}>
                  <td className="csp-mono">{d.doc_no || '—'}</td>
                  <td>{d.desc}</td>
                  <td className="csp-mono">{d.rev || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {documents.length === 0 && (
        <div className="csp-block">
          <SectionHead>DOCUMENT INDEX</SectionHead>
          <div className="csp-empty-block">No documents added yet.</div>
        </div>
      )}

      {/* ── Reference / drawings note ── */}
      {hasDrawings && (
        <div className="csp-block">
          <SectionHead>REFERENCE</SectionHead>
          <div className="csp-ref-note">
            {pdfFiles.length > 0
              ? `${pdfFiles.length} source PDF${pdfFiles.length !== 1 ? 's' : ''} attached — will be merged into drawings package.`
              : 'Drawings list populated from manual rows (no source PDFs uploaded).'}
          </div>
        </div>
      )}

    </div>
  )
}
