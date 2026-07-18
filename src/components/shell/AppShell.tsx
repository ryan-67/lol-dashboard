import { Outlet, useLocation } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import '../../theme/shell.css'

export default function AppShell() {
  const location = useLocation()
  const mode = location.pathname.startsWith('/duo')
    ? 'duo'
    : location.pathname.startsWith('/chat')
      ? 'chat'
      : 'dashboard'

  return (
    <div className={`app-shell-v2 app-shell-v2--${mode}`}>
      <AppSidebar />
      <main className="app-shell-v2-main">
        <Outlet />
      </main>
    </div>
  )
}
