import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopBar from '../TopBar'
import SignalLoader from '../ui/SignalLoader'
import { useDashboard } from '../../context/DashboardContext'
import { revealDashboardSections } from '../../theme/animations'

/** Nested app panes scroll — not the document. Reset on every tab/route change. */
function scrollDashboardToTop() {
  const duo = document.querySelector('.duo-dashboard')
  if (duo instanceof HTMLElement) {
    duo.scrollTop = 0
    return
  }
  const frame = document.querySelector('.dashboard-frame--scroll')
  if (frame instanceof HTMLElement) {
    frame.scrollTop = 0
  }
}

export default function DashboardFrame() {
  const { loading, error } = useDashboard()
  const location = useLocation()
  const inDuo = location.pathname.startsWith('/duo')
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollDashboardToTop()
    // After layout/filters mount, ensure we're still at top
    const id = window.requestAnimationFrame(() => scrollDashboardToTop())
    return () => window.cancelAnimationFrame(id)
  }, [location.pathname])

  useEffect(() => {
    if (loading || error) return
    const id = window.requestAnimationFrame(() => {
      revealDashboardSections(mainRef.current)
    })
    return () => window.cancelAnimationFrame(id)
  }, [location.pathname, loading, error])

  const isEntityPage =
    /\/(players|teams|champions|tournaments)\/[^/]+/.test(location.pathname) ||
    /\/series\/[^/]+/.test(location.pathname)

  const normalized = location.pathname.replace(/^\/duo/, '/dashboard')
  const isListTab =
    normalized === '/dashboard' ||
    normalized === '/dashboard/players' ||
    normalized === '/dashboard/teams' ||
    normalized === '/dashboard/champions' ||
    normalized === '/dashboard/tournaments'

  // Matchups uses its own team selectors — league/year/split strip is irrelevant
  const shouldShowTopBar = isListTab && !isEntityPage

  return (
    <div
      className={`dashboard-frame${inDuo ? '' : ' dashboard-frame--scroll'}`}
      data-lenis-prevent
    >
      {shouldShowTopBar || isEntityPage ? (
        <div
          className={`dashboard-frame-filters${
            shouldShowTopBar && !isEntityPage ? ' dashboard-frame-filters--scrollaway' : ''
          }`}
        >
          {shouldShowTopBar ? <TopBar /> : null}
          {isEntityPage ? (
            <>
              <div id="entity-filter-slot" />
              <div id="entity-tab-slot" />
              <div id="entity-section-slot" />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="dashboard-frame-main" ref={mainRef}>
        {error ? (
          <div className="error-banner">
            <p className="error-title">Failed to load data</p>
            <p className="error-detail">{error}</p>
          </div>
        ) : null}

        {loading && !error ? (
          <div className="dash-frame-loading">
            <SignalLoader compact label="loading dashboard data…" />
          </div>
        ) : null}

        {!error ? (
          <div key={location.pathname} className="tab-content dash-reveal-ready">
            <Outlet />
          </div>
        ) : null}
      </div>
    </div>
  )
}
