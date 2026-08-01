import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopBar from '../TopBar'
import SignalLoader from '../ui/SignalLoader'
import { useDashboard } from '../../context/DashboardContext'
import { refreshScrollTrigger, revealDashboardSections, routeSweepIn } from '../../theme/animations'
import { registerAppScroller, scrollAppToTop } from '../../lib/appScroll'

export default function DashboardFrame() {
  const { loading, error } = useDashboard()
  const location = useLocation()
  const inDuo = location.pathname.startsWith('/duo')
  const frameRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const swapRef = useRef<HTMLDivElement>(null)

  /**
   * Smooth scroll attaches to whichever element actually owns overflow:
   * the frame itself standalone, the `.duo-dashboard` column in duo.
   */
  useLayoutEffect(() => {
    const frame = frameRef.current
    const inner = innerRef.current
    if (!frame || !inner) return

    const wrapper = inDuo ? frame.closest<HTMLElement>('.duo-dashboard') : frame
    const content = inDuo ? frame : inner
    return registerAppScroller(wrapper, content)
  }, [inDuo])

  useEffect(() => {
    scrollAppToTop()
    const id = window.requestAnimationFrame(() => scrollAppToTop())
    return () => window.cancelAnimationFrame(id)
  }, [location.pathname])

  useEffect(() => {
    if (loading || error) return
    const tween = routeSweepIn(swapRef.current)
    return () => {
      tween?.kill()
    }
  }, [location.pathname, loading, error])

  useEffect(() => {
    if (loading || error) return
    const id = window.requestAnimationFrame(() => {
      revealDashboardSections(mainRef.current)
      refreshScrollTrigger()
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

  // Predictions / entity pages own their chrome; list tabs get league lens only.
  const shouldShowTopBar = isListTab && !isEntityPage

  return (
    <div ref={frameRef} className={`dashboard-frame${inDuo ? '' : ' dashboard-frame--scroll'}`}>
      <div className="dashboard-frame-inner" ref={innerRef}>
        {shouldShowTopBar || isEntityPage ? (
          <div className="dashboard-frame-filters">
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
            <div
              key={location.pathname}
              ref={swapRef}
              className="tab-content dash-reveal-ready"
            >
              <span className="tab-content-scanline" aria-hidden="true" />
              <Outlet />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
