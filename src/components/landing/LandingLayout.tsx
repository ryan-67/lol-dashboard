import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import AuthModal from '../AuthModal'
import { useAuth } from '../../context/AuthContext'

type AuthView = 'signin' | 'signup'

const MARKETING_NAV = [
  { to: '/features', label: 'features' },
  { to: '/faq', label: 'faq' },
  { to: '/pricing', label: 'pricing' },
]

const FOOTER_PRODUCT = [
  { to: '/features', label: 'features' },
  { to: '/faq', label: 'faq' },
  { to: '/pricing', label: 'pricing' },
  { to: '/dashboard', label: 'dashboard' },
]

interface LandingLayoutProps {
  children: ReactNode
}

export default function LandingLayout({ children }: LandingLayoutProps) {
  const { user, loading: authLoading, signOut } = useAuth()
  const location = useLocation()
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="nucky home">
            <span className="landing-brand-mark" aria-hidden>
              N
            </span>
            <span className="landing-brand-name">nucky</span>
          </Link>

          <nav className="landing-nav" aria-label="Product">
            {MARKETING_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `landing-nav-link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="landing-header-actions">
            {!authLoading && user ? (
              <>
                <Link className="landing-btn landing-btn-ghost" to="/dashboard">
                  open dashboard
                </Link>
                <button type="button" className="landing-btn landing-btn-ghost" onClick={() => signOut()}>
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
              <span />
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="landing-mobile-nav" aria-label="Mobile">
            {MARKETING_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className="landing-mobile-link">
                {item.label}
              </NavLink>
            ))}
            <Link to="/dashboard" className="landing-mobile-link">
              dashboard
            </Link>
            {!user ? (
              <>
                <button type="button" className="landing-mobile-link" onClick={() => openAuth('signin')}>
                  sign in
                </button>
                <button type="button" className="landing-mobile-link" onClick={() => openAuth('signup')}>
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
              <span className="landing-brand-mark" aria-hidden>
                N
              </span>
              <span className="landing-brand-name">nucky</span>
            </Link>
            <p className="landing-footer-blurb">
              tier-1 LoL esports analytics with a proprietary rating engine and an AI analyst grounded in
              real match data.
            </p>
            <p className="landing-footer-meta">© 2026 nucky · nuckyaigg@gmail.com</p>
          </div>

          <div className="landing-footer-col">
            <h2 className="landing-footer-heading">product</h2>
            <ul>
              {FOOTER_PRODUCT.map((item) => (
                <li key={item.to}>
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
                <Link to="/nuckyai">nuckyAI</Link>
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
