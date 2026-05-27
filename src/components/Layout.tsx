import { NavLink, useLocation } from 'react-router-dom'
import TopBar from './TopBar'

const nav = [
  { to: '/', label: 'Overview' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/champions', label: 'Champions' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-950 border-b border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">LoL Pro Dashboard</h1>
          <nav className="flex gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to + location.search}
                className={() =>
                  `px-4 py-2 rounded text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? 'bg-blue-600 text-white'
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
        {children}
      </main>
    </div>
  )
}
