import TopBar from './TopBar'
import AnimatedOutlet from './AnimatedOutlet'
import { useDashboard } from '../context/DashboardContext'
import { NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Overview' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
  { to: '/matchups', label: 'Matchups' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { loading, error } = useDashboard()
  const location = useLocation()

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
          <nav className="flex flex-wrap gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to + location.search}
                className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
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
                Ensure Oracle&apos;s Elixir CSV files exist in <code>lol/</code> and run{' '}
                <code>npm run ingest</code>.
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
    </div>
  )
}
