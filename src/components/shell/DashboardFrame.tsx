import { Outlet, useLocation } from 'react-router-dom'
import TopBar from '../TopBar'
import { useDashboard } from '../../context/DashboardContext'

export default function DashboardFrame() {
  const { loading, error } = useDashboard()
  const location = useLocation()
  const inDuo = location.pathname.startsWith('/duo')

  const isEntityPage =
    /\/(players|teams|champions|tournaments)\/[^/]+/.test(location.pathname) ||
    /\/series\/[^/]+/.test(location.pathname)

  const normalized = location.pathname.replace(/^\/duo/, '/dashboard')
  const isListTab =
    normalized === '/dashboard' ||
    normalized === '/dashboard/players' ||
    normalized === '/dashboard/teams' ||
    normalized === '/dashboard/champions' ||
    normalized === '/dashboard/matchups' ||
    normalized === '/dashboard/tournaments'

  const shouldShowTopBar = isListTab && !isEntityPage

  return (
    <div
      className={`dashboard-frame${inDuo ? '' : ' dashboard-frame--scroll'}`}
      data-lenis-prevent
    >
      {shouldShowTopBar || isEntityPage ? (
        <div className="dashboard-frame-filters">
          {shouldShowTopBar ? <TopBar /> : null}
          {isEntityPage ? (
            <>
              <div id="entity-filter-slot" />
              <div id="entity-tab-slot" />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="dashboard-frame-main">
        {error ? (
          <div className="error-banner">
            <p className="error-title">Failed to load data</p>
            <p className="error-detail">{error}</p>
          </div>
        ) : null}

        {loading && !error ? (
          <div className="flex items-center justify-center h-12 mb-4">
            <div className="text-secondary text-sm">Loading dashboard data...</div>
          </div>
        ) : null}

        {!error ? (
          <div key={location.pathname} className="tab-content">
            <Outlet />
          </div>
        ) : null}
      </div>
    </div>
  )
}
