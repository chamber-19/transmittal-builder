import { useState, useEffect, useCallback } from 'react'
import { getMe } from './api.js'
import LoginPage from './components/LoginPage.jsx'
import ProjectPicker from './components/ProjectPicker.jsx'
import TransmittalForm from './components/TransmittalForm.jsx'
import HelpDrawer from './components/HelpDrawer.jsx'
import ProfileSetupModal from './components/ProfileSetupModal.jsx'
import SplashScreen from './components/SplashScreen.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('login')
  const [project, setProject] = useState(null)
  const [checking, setChecking] = useState(true)
  const [showProfileSetup, setShowProfileSetup] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token')
    if (!token) { setChecking(false); return }
    getMe()
      .then(u => {
        setUser(u)
        setView('projects')
        if (!u.display_name) setShowProfileSetup(true)
      })
      .catch(() => sessionStorage.removeItem('auth_token'))
      .finally(() => setChecking(false))
  }, [])

  const handleLogin = useCallback((credential, userInfo) => {
    sessionStorage.setItem('auth_token', credential)
    setUser(userInfo)
    setView('projects')
    if (!userInfo.display_name) setShowProfileSetup(true)
  }, [])

  const handleProfileComplete = useCallback((name) => {
    setUser(u => ({ ...u, display_name: name }))
    setShowProfileSetup(false)
    setView('projects')
  }, [])

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem('auth_token')
    setUser(null)
    setProject(null)
    setShowProfileSetup(false)
    setView('login')
  }, [])

  const handleProjectSelect = useCallback(scanResult => {
    setProject(scanResult)
    setView('form')
  }, [])

  const handleBack = useCallback(() => {
    setProject(null)
    setView('projects')
  }, [])

  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />

  if (checking) return null

  if (view === 'login') return <LoginPage onLogin={handleLogin} />

  return (
    <div className="page">
      <header className="header">
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span className="header__brand">Transmittal Builder</span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.8 }}>
            Build your next transmittal letter
          </span>
        </div>

        <div className="row row--8">
          {view === 'form' && (
            <button className="header__back" onClick={handleBack}>← Projects</button>
          )}
          {user && (
            <div className="header__user">
              {user.picture && (
                <img className="header__avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
              )}
              <span>{user.display_name || user.email}</span>
              <button className="btn btn--ghost btn--sm" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: view === 'form' ? 0 : '32px 24px' }}>
        {view === 'projects' && (
          <ProjectPicker
            onSelect={handleProjectSelect}
            isDeveloper={user?.is_developer}
          />
        )}
        {view === 'form' && project && <TransmittalForm project={project} onBack={handleBack} />}
      </main>

      <HelpDrawer />

      {showProfileSetup && user && (
        <ProfileSetupModal user={user} onComplete={handleProfileComplete} />
      )}
    </div>
  )
}
