import { useEffect, useRef, useState } from 'react'
import TopBar from './TopBar'
import AnimatedOutlet from './AnimatedOutlet'
import AuthModal from './AuthModal'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { navSearchForPath, stripNuckyAiSearchParams } from '../lib/navSearchParams'
import { GlobalSearch } from './entities'

const primaryNav = [
  { to: '/', label: 'Overview' },
  { to: '/nuckyai', label: 'nuckyAI' },
]

const menuNav = [
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
  { to: '/matchups', label: 'Matchups' },
  { to: '/faq', label: 'FAQ' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { loading, error } = useDashboard()
  const { user, loading: authLoading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const hideTopBarRoutes = new Set(['/nuckyai', '/faq', '/profile'])
  const isEntityPage =
    /^\/players\/[^/]+/.test(location.pathname) ||
    /^\/teams\/[^/]+/.test(location.pathname) ||
    /^\/champions\/[^/]+/.test(location.pathname)
  const shouldShowTopBar = !hideTopBarRoutes.has(location.pathname) && !isEntityPage

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (location.pathname === '/nuckyai') return
    const cleaned = stripNuckyAiSearchParams(location.search)
    if (cleaned !== location.search) {
      navigate({ pathname: location.pathname, search: cleaned }, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    let mounted = true
    async function loadSubscription() {
      if (!user) {
        if (mounted) {
          setIsSubscribed(false)
          setUsername(null)
        }
        return
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_subscribed, username')
        .eq('id', user.id)
        .maybeSingle()

      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .limit(1)

      const hasActiveSub = Array.isArray(subData) && subData.length > 0
      if (mounted) {
        setIsSubscribed(Boolean(profileData?.is_subscribed) || hasActiveSub)
        setUsername((profileData?.username as string | null) ?? null)
      }
    }
    void loadSubscription()
    return () => {
      mounted = false
    }
  }, [user])

  function renderNavItem(item: { to: string; label: string }, onNavigate?: () => void) {
    const isNuckyAi = item.to === '/nuckyai'
    const blocked = isNuckyAi && (!user || !isSubscribed)
    return (
      <div key={item.to} className="relative group">
        <NavLink
          to={item.to + navSearchForPath(item.to, location.search)}
          className={({ isActive }) =>
            `nav-tab${isActive ? ' active' : ''}${blocked ? ' opacity-50' : ''}`
          }
          onClick={onNavigate}
        >
          {item.label}
        </NavLink>
        {blocked && (
          <div className="pointer-events-none absolute top-full left-0 mt-1 hidden group-hover:block border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)] whitespace-nowrap z-50">
            nuckyAI is only available with a subscription
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner app-header-bar py-3">
          <Link
            to="/"
            className="flex items-center gap-3 no-underline text-inherit hover:opacity-90 transition-opacity shrink-0"
            aria-label="nucky.gg home — Overview"
          >
            <div
              className="w-8 h-8 flex items-center justify-center border border-accent"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <span className="text-accent font-bold text-sm">N</span>
            </div>
            <h1 className="text-base font-medium text-primary tracking-tight hidden sm:block">nucky</h1>
          </Link>

          <div className="app-header-nav-cluster">
            {primaryNav.map((item) => renderNavItem(item))}

            <GlobalSearch />

            {!authLoading && user ? (
              <>
                <Link className="header-profile-link" to="/profile">
                  {username ? `@${username}` : user.email}
                </Link>
                <button type="button" className="btn" onClick={() => signOut()}>
                  logout
                </button>
              </>
            ) : null}

            {!authLoading && !user ? (
              <button type="button" className="btn" onClick={() => setShowAuth(true)}>
                login
              </button>
            ) : null}

            <div className="header-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="header-menu-btn"
                aria-label="More navigation"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span />
                <span />
                <span />
              </button>
              {menuOpen && (
                <nav className="header-menu-dropdown">
                  {menuNav.map((item) => renderNavItem(item, () => setMenuOpen(false)))}
                </nav>
              )}
            </div>
          </div>
        </div>
        {shouldShowTopBar && <TopBar />}
        {isEntityPage && <div id="entity-filter-slot" />}
      </header>

      <main className="app-main">
        <div className="app-main-inner">
          {error && (
            <div className="error-banner">
              <p className="error-title">Failed to load data</p>
              <p className="error-detail">{error}</p>
              <p className="error-detail mt-2">
                Check <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
                <code>.env</code>, confirm RLS allows read on <code>oe_slices</code>, and run{' '}
                <code>python scripts/seed_supabase.py</code> if the table is empty.
              </p>
            </div>
          )}

          {loading && !error && (
            <div className="flex items-center justify-center h-16 mb-8">
              <div className="text-secondary text-sm">Loading dashboard data...</div>
            </div>
          )}

          {!error && <AnimatedOutlet>{children}</AnimatedOutlet>}
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span>Data from Oracle&apos;s Elixir. Dashboard auto-refreshes daily.</span>
            <span className="text-[10px] italic text-[var(--text-tertiary)] opacity-80">
              nucky.gg is not endorsed by Riot Games. League of Legends and Riot Games are
              trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot
              Games, Inc.
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)]">
            © 2026 nucky -{' '}
            <Link className="text-[var(--accent)] hover:underline" to="/private-policy">
              Private Policy
            </Link>
          </div>
        </div>
      </footer>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  )
}
