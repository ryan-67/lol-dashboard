import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AuthModal from '../AuthModal'
import BrandMark from './BrandMark'
import { initHyperText } from './motion'
import { useAuth } from '../../context/AuthContext'
import { useViewPreference } from '../../context/ViewPreferenceContext'

type AuthView = 'signin' | 'signup'

const MARKETING_NAV = [
  { to: '/dashboard', label: 'dashboard' },
  { to: '/#features', label: 'product' },
  { to: '/#model', label: 'model' },
  { to: '/#pricing', label: 'pricing' },
  { to: '/#faq', label: 'faq' },
]

interface LandingLayoutProps {
  children: ReactNode
}

export default function LandingLayout({ children }: LandingLayoutProps) {
  const { user, loading: authLoading, signOut } = useAuth()
  const { homePath } = useViewPreference()
  const location = useLocation()
  const headerRef = useRef<HTMLElement>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  /* Letter-scramble hover on the nav tabs. */
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    return initHyperText(header)
  }, [])

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  return (
    <div className="landing-shell">
      <header className="landing-header" ref={headerRef}>
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="nucky home">
            <BrandMark className="brand-mark--lg" />
            <span className="landing-brand-name">nucky</span>
          </Link>

          <nav className="landing-nav" aria-label="Product">
            {MARKETING_NAV.map((item) => (
              <Link key={item.to} to={item.to} className="landing-nav-link" data-hyper>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="landing-header-actions">
            {!authLoading && user ? (
              <>
                <Link className="landing-btn landing-btn-ghost" to={homePath}>
                  <span className="btn-label">open app</span>
                </Link>
                <button
                  type="button"
                  className="landing-btn landing-btn-ghost"
                  onClick={() => signOut()}
                >
                  <span className="btn-label">logout</span>
                </button>
              </>
            ) : null}

            {!authLoading && !user ? (
              <>
                <button
                  type="button"
                  className="landing-btn landing-btn-ghost"
                  onClick={() => openAuth('signin')}
                >
                  <span className="btn-label">sign in</span>
                </button>
                <button
                  type="button"
                  className="landing-btn landing-btn-primary"
                  onClick={() => openAuth('signup')}
                >
                  <span className="btn-label">create account</span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="landing-menu-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="landing-mobile-nav" aria-label="Mobile">
            {MARKETING_NAV.map((item) => (
              <Link key={item.to} to={item.to} className="landing-mobile-link">
                {item.label}
              </Link>
            ))}
            <Link to={homePath} className="landing-mobile-link">
              open app
            </Link>
            {!user ? (
              <>
                <button
                  type="button"
                  className="landing-mobile-link"
                  onClick={() => openAuth('signin')}
                >
                  sign in
                </button>
                <button
                  type="button"
                  className="landing-mobile-link"
                  onClick={() => openAuth('signup')}
                >
                  create account
                </button>
              </>
            ) : null}
          </nav>
        ) : null}
      </header>

      <main className="landing-main">{children}</main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
