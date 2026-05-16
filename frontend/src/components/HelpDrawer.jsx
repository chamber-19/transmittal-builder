import { useState, useCallback, useRef } from 'react'

const SECTIONS = [
  {
    id: 'overview',
    title: 'What This App Does',
    icon: '⚡',
    body: [
      {
        type: 'p',
        text: 'Transmittal Builder generates formal engineering transmittal packages — a structured cover sheet combined with your source PDFs into a single deliverable. Every transmittal gets its own numbered folder in the project\'s Transmittals directory on the server.',
      },
      {
        type: 'p',
        text: 'A completed package contains: a filled-out transmittal cover sheet (DOCX + PDF) and optionally a merged PDF of all the drawings being transmitted, all written to a versioned XMTL-NNN folder.',
      },
    ],
  },
  {
    id: 'signing-in',
    title: 'Signing In',
    icon: '🔐',
    body: [
      {
        type: 'p',
        text: 'The app uses your Chamber 19 Google account for authentication. Click "Sign in with Google" on the login screen and select your @chamber19.com account (or whichever account has been granted access).',
      },
      {
        type: 'note',
        text: 'If you see "Access denied", your account hasn\'t been added to the allow-list. Contact your administrator.',
      },
    ],
  },
  {
    id: 'projects',
    title: 'Finding Your Project',
    icon: '📂',
    steps: [
      {
        n: '1',
        title: 'Search',
        text: 'Type a job number or project name in the search bar. The list filters live — no rescan needed.',
      },
      {
        n: '2',
        title: 'Open a project',
        text: 'Click any row. The app scans that project\'s folder, locates its Transmittals subfolder, identifies the next available XMTL number, and loads any saved contacts. The form opens with everything pre-filled.',
      },
    ],
    notes: [
      'The Transmittals folder is detected automatically — any subfolder whose name contains "Transmittal" qualifies.',
      'The XMTL number is determined by counting existing XMTL-001, XMTL-002, … folders and incrementing.',
    ],
  },
  {
    id: 'project-info',
    title: 'Project Information',
    icon: '📋',
    body: [
      { type: 'p', text: 'These fields populate the header of the transmittal cover sheet.' },
    ],
    fields: [
      { name: 'Job Number', desc: 'The project\'s numeric job number (e.g. 25074). Auto-filled from the folder name.' },
      { name: 'Transmittal No.', desc: 'The sequence number for this transmittal. Auto-filled to the next available slot. Click the amber "Next: NNN" chip to jump to it if you\'ve edited the field.' },
      { name: 'Date', desc: 'Defaults to today. Edit freely — the format on the cover sheet mirrors what you type here.' },
      { name: 'Client / Site', desc: 'Client name and site, combined. Auto-filled from the project folder name.' },
      { name: 'Project Description', desc: 'Brief project scope description. Appears in the cover sheet subheader.' },
    ],
  },
  {
    id: 'sender',
    title: 'Sender Information',
    icon: '👤',
    body: [
      { type: 'p', text: 'Your details as the engineer transmitting the package. Fill them in once per session.' },
    ],
    fields: [
      { name: 'Name', desc: 'Your full name as it should appear on the cover sheet.' },
      { name: 'Title', desc: 'Your job title or role (e.g. "Managing Partner, P.E.").' },
      { name: 'Email / Phone', desc: 'Contact details printed on the cover sheet.' },
      { name: 'Firm Registration', desc: 'Your Texas (or other state) engineering firm registration number (e.g. "TX FIRM #20290").' },
    ],
  },
  {
    id: 'options',
    title: 'Transmittal Options',
    icon: '☑',
    body: [
      { type: 'p', text: 'These checkboxes control which boxes are ticked on the transmittal cover sheet template.' },
    ],
    fields: [
      { name: 'Transmitted', desc: 'The medium being sent — PDF, CAD, or Originals. Select all that apply.' },
      { name: 'Sent Via', desc: 'How the package is being delivered — Email or FTP.' },
      { name: 'Transmittal Type / Intent', desc: 'Purpose of the transmittal — For Approval, For Construction, etc. Only one can be selected at a time.' },
      { name: 'Vendor Response', desc: 'Used when responding to a vendor submittal — Approved, Approved as Noted, or Rejected.' },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts (Recipients)',
    icon: '👥',
    steps: [
      {
        n: '+',
        title: 'Add contacts',
        text: 'Click Add to insert a new row. Fill in Name, Company, Email, and Phone. Each contact gets a row on the cover sheet.',
      },
      {
        n: '💾',
        title: 'Save to address book',
        text: 'Click Save to store the current contact list in your browser\'s address book. Saved lists can be imported into future transmittals.',
      },
      {
        n: '📖',
        title: 'Import from address book',
        text: 'Click Address Book to see previously saved lists. Click Import to load a saved list into the current form.',
      },
    ],
    notes: [
      'Contacts are automatically loaded from the project folder if a contacts.json file is present there.',
      'The address book is stored locally in your browser — it won\'t transfer between machines.',
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: '📄',
    body: [
      { type: 'p', text: 'The document table lists every drawing being transmitted. Each row appears as a line item on the cover sheet.' },
    ],
    steps: [
      {
        n: '1',
        title: 'Drop PDFs to auto-populate',
        text: 'Drag PDF files from Explorer and drop them onto the drop zone. Each PDF filename is parsed to extract a document number and description. Rows sort automatically in natural drawing-number order.',
      },
      {
        n: '2',
        title: 'Drop an Excel index for revisions',
        text: 'Drop an .xlsx drawing index to merge revision letters into matching rows. Read-only — it fills the Rev column where document numbers match.',
      },
      {
        n: '3',
        title: 'Edit rows manually',
        text: 'Click Add Row to insert a blank row. Edit Doc No., Description, and Rev directly in the table. Click × to remove a row.',
      },
    ],
    notes: [
      'PDFs you drop also become the source drawings — they\'re merged into the combined-drawings PDF output.',
      'Document numbers must match between the PDF filename and the Excel index for revisions to apply.',
    ],
  },
  {
    id: 'output',
    title: 'Generating the Package',
    icon: '⚡',
    steps: [
      {
        n: '1',
        title: 'Check completeness',
        text: 'The amber bar shows how complete the form is. You can generate as long as you have at least one drawing and a job number.',
      },
      {
        n: '2',
        title: 'Click Complete Transmittal',
        text: 'A new XMTL-NNN folder is created in the project\'s Transmittals directory containing the cover sheet (DOCX + PDF) and a merged drawings PDF. A ZIP is also downloaded for email attachment.',
      },
    ],
    notes: [
      'If you try to generate a transmittal number that already exists, you\'ll be prompted before overwriting.',
      'The combined-drawings PDF is only included if you uploaded source PDFs.',
      'DOCX → PDF conversion requires Microsoft Word to be installed on the server.',
    ],
  },
  {
    id: 'tips',
    title: 'Tips & Shortcuts',
    icon: '💡',
    tips: [
      'Click the "Next: NNN" chip next to Transmittal No. to jump to the next available number and optionally clear the form for a fresh session.',
      'Dropping multiple PDFs at once sorts them automatically in drawing-number order (natural sort — E1-001 before E1-002 before E1-010).',
      'The Excel drawing index can be re-dropped at any time to refresh revision letters without losing your PDF list.',
      'After generating, the form stays open and the XMTL number advances — start the next transmittal immediately without going back to projects.',
      'The address book stores contact lists by job number and client. Re-saving updates the existing entry.',
    ],
  },
]

// ── Panel content ────────────────────────────────────────────────
function PanelContent() {
  return (
    <>
      <div className="help-drawer__header">
        <div className="help-drawer__title">
          <span className="help-drawer__title-icon">?</span>
          How to Use Transmittal Builder
        </div>
      </div>

      <div className="help-drawer__body">
        {SECTIONS.map(s => (
          <section key={s.id} className="help-section">
            <h2 className="help-section__heading">
              <span className="help-section__icon">{s.icon}</span>
              {s.title}
            </h2>

            {s.body?.map((b, i) =>
              b.type === 'p' ? (
                <p key={i} className="help-p">{b.text}</p>
              ) : (
                <div key={i} className="help-note">{b.text}</div>
              )
            )}

            {s.steps && (
              <ol className="help-steps">
                {s.steps.map((step, i) => (
                  <li key={i} className="help-step">
                    <span className="help-step__num">{step.n}</span>
                    <div>
                      <div className="help-step__title">{step.title}</div>
                      <div className="help-step__text">{step.text}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {s.fields && (
              <dl className="help-fields">
                {s.fields.map((f, i) => (
                  <div key={i} className="help-field-row">
                    <dt className="help-field__name">{f.name}</dt>
                    <dd className="help-field__desc">{f.desc}</dd>
                  </div>
                ))}
              </dl>
            )}

            {s.table && (
              <table className="help-table">
                <thead><tr><th>Item</th><th>Weight</th></tr></thead>
                <tbody>
                  {s.table.map(([item, pct], i) => (
                    <tr key={i}><td>{item}</td><td><span className="help-pct">{pct}</span></td></tr>
                  ))}
                </tbody>
              </table>
            )}

            {s.tips && (
              <ul className="help-tips">
                {s.tips.map((t, i) => <li key={i} className="help-tip">{t}</li>)}
              </ul>
            )}

            {s.notes && s.notes.map((n, i) => (
              <div key={i} className="help-note">{n}</div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

// ── Main component ───────────────────────────────────────────────
export default function HelpDrawer() {
  const [open, setOpen] = useState(false)
  const dragState = useRef(null)

  const handleTabPointerDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()

    const startX = e.clientX
    const wasOpen = open
    dragState.current = { startX, moved: false, wasOpen }

    const onMove = (me) => {
      const delta = Math.abs(me.clientX - startX)
      if (delta > 5) dragState.current.moved = true
    }

    const onUp = (ue) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const ds = dragState.current
      if (!ds.moved) {
        // plain click — toggle
        setOpen(v => !v)
      } else {
        // drag: left = open, right = close
        const delta = startX - ue.clientX
        if (delta > 40)  setOpen(true)
        else if (delta < -40) setOpen(false)
        else setOpen(ds.wasOpen) // not far enough — revert
      }
      dragState.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [open])

  return (
    <div className="help-shell" aria-label="User guide panel">
      {/* Panel slides in to the left of the tab */}
      <div className={`help-panel${open ? ' help-panel--open' : ''}`} role="complementary">
        <div className="help-panel__inner">
          <PanelContent />
        </div>
      </div>

      {/* Tab — always visible at the right edge */}
      <button
        type="button"
        className={`help-tab${open ? ' help-tab--open' : ''}`}
        onPointerDown={handleTabPointerDown}
        title={open ? 'Close user guide' : 'Open user guide'}
        aria-expanded={open}
      >
        <span className="help-tab__arrow" aria-hidden="true">{open ? '›' : '‹'}</span>
        <span className="help-tab__label">User Guide</span>
      </button>
    </div>
  )
}
