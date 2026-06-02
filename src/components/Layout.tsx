import { useEffect, useState } from 'react'
import TopBar from './TopBar'
import AnimatedOutlet from './AnimatedOutlet'
import AuthModal from './AuthModal'
import { useDashboard } from '../context/DashboardContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Overview' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
  { to: '/matchups', label: 'Matchups' },
  { to: '/nuckyai', label: 'nuckyAI' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { loading, error } = useDashboard()
  const { user, loading: authLoading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let mounted = true
    async function loadSubscription() {
      if (!user) {
        if (mounted) setIsSubscribed(false)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('is_subscribed')
        .eq('id', user.id)
        .maybeSingle()
      if (mounted) setIsSubscribed(Boolean(data?.is_subscribed))
    }
    void loadSubscription()
    return () => {
      mounted = false
    }
  }, [user])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center border border-accent"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <span className="text-accent font-bold text-sm">N</span>
            </div>
            <h1 className="text-base font-medium text-primary tracking-tight">nucky</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex flex-wrap gap-1">
              {nav.map((item) => {
                const isNuckyAi = item.to === '/nuckyai'
                const blocked = isNuckyAi && !isSubscribed
                return (
                  <div key={item.to} className="relative group">
                    <NavLink
                      to={item.to + location.search}
                      className={({ isActive }) =>
                        `nav-tab${isActive ? ' active' : ''}${blocked ? ' opacity-50' : ''}`
                      }
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
              })}
            </nav>
            {!authLoading && (
              <div className="flex items-center gap-2">
                {user ? (
                  <>
                    <span className="text-secondary text-xs">{user.email}</span>
                    <button type="button" className="btn" onClick={() => signOut()}>
                      logout
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn" onClick={() => setShowAuth(true)}>
                    login
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <TopBar />
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
        <div className="app-footer-inner">
          Data from Oracle&apos;s Elixir. Dashboard auto-refreshes daily.
        </div>
      </footer>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  )
}
