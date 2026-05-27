import TopBar from './TopBar'
import { useDashboard } from '../context/DashboardContext'

export default function Layout({ children }: { children: React.ReactNode }) {
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
