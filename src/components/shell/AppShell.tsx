import { Suspense, lazy, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import AmbientField from './AmbientField'
import { AMBIENT_TRAIL_EVENT, ambientTrailEnabled } from '../../lib/ambientTrail'
import { useDashboard } from '../../context/DashboardContext'
import '../../theme/shell.css'

const AppCursorTrail = lazy(() => import('./AppCursorTrail'))

export default function AppShell() {
  const location = useLocation()
  const { loading, oeDetailLoading } = useDashboard()
  const mode = location.pathname.startsWith('/duo')
    ? 'duo'
    : location.pathname.startsWith('/chat')
      ? 'chat'
      : 'dashboard'

  const [trailOn, setTrailOn] = useState(() => ambientTrailEnabled())
  // Defer Three.js trail until OE bootstrap has painted — keeps first load snappy.
  const trailAllowed = trailOn && !loading && !oeDetailLoading

  useEffect(() => {
    const handleTrailChange = () => setTrailOn(ambientTrailEnabled())
    window.addEventListener(AMBIENT_TRAIL_EVENT, handleTrailChange)
    return () => window.removeEventListener(AMBIENT_TRAIL_EVENT, handleTrailChange)
  }, [])

  return (
    <div className={`app-shell-v2 app-shell-v2--${mode}`}>
      <AmbientField />
      <AppSidebar />
      <main className="app-shell-v2-main">
        <Outlet />
      </main>
      {trailAllowed ? (
        <Suspense fallback={null}>
          <AppCursorTrail />
        </Suspense>
      ) : null}
    </div>
  )
}
