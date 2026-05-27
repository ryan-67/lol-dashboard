import { NavLink, useLocation } from 'react-router-dom'
import TopBar from './TopBar'
import { useDashboard } from '../context/DashboardContext'

const nav = [
  { to: '/', label: 'Overview' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { loading, error } = useDashboard()

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="border-b border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">LoL Pro Dashboard</h1>
          </div>
          <nav className="flex gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to + location.search}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <TopBar />
      </header>

      <main className="flex-1 p-6 overflow-auto">
        {loading && !error && (
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-400 text-sm animate-pulse">Loading dashboard data...</div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 mb-6">
            <p className="text-red-400 text-sm font-medium">Failed to load data</p>
            <p className="text-red-500/70 text-xs mt-1">{error}</p>
          </div>
        )}

        {children}
      </main>

      <footer className="border-t border-slate-800 px-6 py-3 text-xs text-slate-600">
        Data from Oracle's Elixir. Dashboard auto-refreshes daily.
      </footer>
    </div>
  )
}
