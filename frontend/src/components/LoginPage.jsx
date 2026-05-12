import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { getMe } from '../api.js'

export default function LoginPage({ onLogin }) {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  async function handleSuccess(response) {
    const credential = response.credential
    setLoading(true)
    setError(null)
    try {
      sessionStorage.setItem('auth_token', credential)
      const user = await getMe()
      onLogin(credential, user)
    } catch (err) {
      sessionStorage.removeItem('auth_token')
      if (err.status === 403) {
        setError('Your Google account is not on the access list. Contact your administrator to be added.')
      } else {
        setError(err.message || 'Sign-in failed. The backend server may not be running — contact your administrator.')
      }
      setShowHelp(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '32px',
      gap: '32px',
    }}>
      {/* Wordmark */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '38px',
          color: 'var(--accent)',
          marginBottom: '6px',
          letterSpacing: '0.01em',
        }}>
          Transmittal Builder
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Chamber 19 — Engineering Tools
        </div>
      </div>

      {/* Sign-in card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        width: '100%',
        maxWidth: '380px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
      }}>
        <div style={{ textAlign: 'center', width: '100%' }}>
          <h2 style={{ marginBottom: '6px', fontSize: '18px' }}>Sign in</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
            Use your authorised Google account to access the tool.
            Only accounts on the allow-list can sign in.
          </p>
        </div>

        {error && (
          <div className="notice notice--error" style={{ width: '100%', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
            <span className="spinner" />
            Verifying with server…
          </div>
        ) : (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Google sign-in failed. Try again or use a different browser.')}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="signin_with"
            logo_alignment="left"
          />
        )}

        {/* Troubleshooting toggle */}
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: 0,
          }}
          onClick={() => setShowHelp(v => !v)}
        >
          {showHelp ? 'Hide troubleshooting' : 'Can\'t sign in?'}
        </button>
      </div>

      {/* Troubleshooting panel */}
      {showHelp && (
        <div style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 20px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '0.02em',
          }}>
            Troubleshooting Sign-In Issues
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <TroubleshootItem
              heading='"Access denied" error after signing in'
              body="Your Google account authenticated successfully, but it isn't on the application's allow-list. Each account must be explicitly added by an administrator — contact your Chamber 19 administrator to be added."
            />

            <TroubleshootItem
              heading="The sign-in button does nothing"
              body="The most common cause is that this page's address isn't in the Authorized JavaScript Origins for the Google OAuth client. An administrator needs to add the current URL (e.g. http://localhost:5173) in Google Cloud Console → APIs & Services → Credentials. Also check that popups aren't blocked and that you're not in a private window with third-party cookies disabled."
            />

            <TroubleshootItem
              heading='"Sign-in failed" or a network error after Google approves'
              body="The backend server is not reachable. This tool requires a Python backend running on the office machine. Contact your administrator to confirm it is started."
            />

            <TroubleshootItem
              heading="Signed in before but can't get back in"
              body="Sessions clear when you close the browser tab — simply sign in again. If your account was working before and now gets 'access denied', it may have been removed from the allow-list. Contact your administrator."
            />

            <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Still stuck? Contact your administrator with the exact error message shown on screen.
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
        © 2026 Chamber 19
      </div>
    </div>
  )
}

function TroubleshootItem({ heading, body, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{heading}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>{body}</div>
      {mono && (
        <code style={{
          display: 'block',
          marginTop: 4,
          padding: '6px 10px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--accent)',
          border: '1px solid var(--border)',
          wordBreak: 'break-all',
        }}>
          {mono}
        </code>
      )}
    </div>
  )
}
