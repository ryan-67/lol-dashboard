import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AuthModal from '../AuthModal'
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
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const FOOTER_PRODUCT = [
    { to: '/dashboard', label: 'dashboard' },
    { to: '/#features', label: 'product' },
    { to: '/#model', label: 'model' },
    { to: '/#pricing', label: 'pricing' },
    { to: '/#faq', label: 'faq' },
    { to: homePath, label: 'open app' },
    { to: '/contact', label: 'contact' },
  ]

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  return (
    <div className="landing-shell">
      <header className={`landing-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="nucky home">
            <span className="nucky-mark nucky-mark--lg" aria-hidden>
              N
            </span>
            <span className="landing-brand-name">nucky</span>
          </Link>

          <nav className="landing-nav" aria-label="Product">
            {MARKETING_NAV.map((item) => (
              <Link key={item.to} to={item.to} className="landing-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="landing-header-actions">
            {!authLoading && user ? (
              <>
                <Link className="landing-btn landing-btn-ghost" to={homePath}>
                  open app
                </Link>
                <button
                  type="button"
                  className="landing-btn landing-btn-ghost"
                  onClick={() => signOut()}
                >
                  logout
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
                  sign in
                </button>
                <button
                  type="button"
                  className="landing-btn landing-btn-primary"
                  onClick={() => openAuth('signup')}
                >
                  create account
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

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <Link to="/" className="landing-brand landing-brand-footer">
              <span className="nucky-mark nucky-mark--lg" aria-hidden>
                N
              </span>
              <span className="landing-brand-name">nucky</span>
            </Link>
            <p className="landing-footer-blurb">
              statistics-backed LoL esports analytics, proprietary ratings, and a conversational
              analyst grounded in historical match data.
            </p>
            <p className="landing-footer-meta">© 2026 nucky · geonbu@nucky.gg</p>
          </div>

          <div className="landing-footer-col">
            <h2 className="landing-footer-heading">product</h2>
            <ul>
              {FOOTER_PRODUCT.map((item) => (
                <li key={item.label}>
                  <Link to={item.to}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-footer-col">
            <h2 className="landing-footer-heading">account</h2>
            <ul>
              {!user ? (
                <>
                  <li>
                    <button type="button" onClick={() => openAuth('signin')}>
                      sign in
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => openAuth('signup')}>
                      create account
                    </button>
                  </li>
                </>
              ) : (
                <li>
                  <Link to="/profile">profile</Link>
                </li>
              )}
              <li>
                <Link to="/chat">nucky</Link>
              </li>
              <li>
                <Link to="/contact">contact</Link>
              </li>
            </ul>
          </div>

          <div className="landing-footer-col">
            <h2 className="landing-footer-heading">legal</h2>
            <ul>
              <li>
                <Link to="/private-policy">privacy</Link>
              </li>
              <li>
                <Link to="/terms">terms</Link>
              </li>
              <li>
                <a href="mailto:geonbu@nucky.gg">geonbu@nucky.gg</a>
              </li>
            </ul>
          </div>
        </div>

        <p className="landing-footer-disclaimer">
          nucky.gg is not endorsed by Riot Games. League of Legends and Riot Games are trademarks or
          registered trademarks of Riot Games, Inc.
        </p>

        <div className="landing-ghost" aria-hidden="true">
          nucky
        </div>
      </footer>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
