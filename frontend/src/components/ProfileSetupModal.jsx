import { useState } from 'react'
import { updateProfile } from '../api.js'

export default function ProfileSetupModal({ user, onComplete }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim()
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter both your first and last name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ display_name: name })
      onComplete(name)
    } catch (e) {
      setError(e.message || 'Could not save profile. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="psm-overlay">
      <div className="psm-card">
        <div className="psm-welcome">
          {user?.picture && (
            <img className="psm-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
          )}
          <div className="psm-heading">Welcome to Transmittal Builder</div>
          <div className="psm-sub">
            You're signing in as <strong>{user?.email}</strong>.<br />
            Enter your name so your team knows who you are.
          </div>
        </div>

        <div className="psm-fields">
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label className="field__label field__label--required">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Jane"
                autoFocus
                onKeyDown={e => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.getElementById('psm-last')?.focus() } }}
              />
            </div>
            <div className="field">
              <label className="field__label field__label--required">Last Name</label>
              <input
                id="psm-last"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              />
            </div>
          </div>

          {error && <div className="notice notice--error" style={{ fontSize: 13 }}>{error}</div>}

          <button
            type="button"
            className="btn btn--primary btn--lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Get Started →'}
          </button>
        </div>
      </div>
    </div>
  )
}
