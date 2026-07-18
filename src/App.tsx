import { useEffect, useRef } from 'react'
import { Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DashboardProvider } from './context/DashboardContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimezoneProvider } from './context/TimezoneContext'
import { ViewPreferenceProvider, useViewPreference } from './context/ViewPreferenceContext'
import { ProfileProvider } from './context/ProfileContext'
import { ChatSessionProvider } from './context/ChatSessionContext'
import LandingLayout from './components/landing/LandingLayout'
import AppShell from './components/shell/AppShell'
import DuoLayout from './components/shell/DuoLayout'
import DashboardFrame from './components/shell/DashboardFrame'
import ChatPane from './components/shell/ChatPane'
import Landing from './pages/Landing'
import Overview from './pages/Overview'
import Players from './pages/Players'
import Teams from './pages/Teams'
import Champions from './pages/Champions'
import Matchups from './pages/Matchups'
import Tournaments from './pages/Tournaments'
import PlayerPage from './pages/entities/PlayerPage'
import TeamPage from './pages/entities/TeamPage'
import ChampionPage from './pages/entities/ChampionPage'
import TournamentPage from './pages/entities/TournamentPage'
import SeriesPage from './pages/entities/SeriesPage'
import PrivatePolicy from './pages/PrivatePolicy'
import Terms from './pages/Terms'
import Contact from './pages/Contact'
import UserProfile from './pages/UserProfile'
import AuthCallback from './pages/AuthCallback'
import ResetPassword from './pages/ResetPassword'

const APP_SHELL_PREFIXES = ['/duo', '/chat', '/dashboard', '/profile', '/contact']

function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

gsap.registerPlugin(ScrollTrigger)

function SmoothScroll({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const lenisRef = useRef<Lenis | null>(null)
  const appShell = isAppShellPath(location.pathname)

  useEffect(() => {
    // Nested scroll panes in the app shell break under document-level Lenis.
    if (appShell) {
      document.documentElement.classList.add('app-shell-scroll')
      return () => {
        document.documentElement.classList.remove('app-shell-scroll')
      }
    }

    document.documentElement.classList.remove('app-shell-scroll')
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      smoothWheel: true,
    })
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)

    ScrollTrigger.scrollerProxy(document.documentElement, {
      scrollTop(value?: number) {
        if (value !== undefined) {
          lenis.scrollTo(value, { immediate: true })
        }
        return lenis.scroll
      },
      getBoundingClientRect() {
        return {
          top: 0,
          left: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        }
      },
    })

    const raf = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    ScrollTrigger.refresh()

    return () => {
      gsap.ticker.remove(raf)
      ScrollTrigger.scrollerProxy(document.documentElement, {})
      lenis.destroy()
      lenisRef.current = null
    }
  }, [appShell])

  useEffect(() => {
    if (appShell) return
    const lenis = lenisRef.current
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
    ScrollTrigger.refresh()
  }, [location.pathname, appShell])

  return <>{children}</>
}

function HomeEntry() {
  const { user, loading: authLoading } = useAuth()
  const { homePath, loading: prefLoading } = useViewPreference()

  if (authLoading || (user && prefLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-secondary text-sm">
        loading…
      </div>
    )
  }

  if (user) return <Navigate to={homePath} replace />

  return (
    <LandingLayout>
      <Landing />
    </LandingLayout>
  )
}

function LegacyEntityRedirect({ type }: { type: 'players' | 'teams' | 'champions' | 'tournaments' }) {
  const { slug } = useParams()
  const { defaultView } = useViewPreference()
  const prefix = defaultView === 'duo' ? '/duo' : '/dashboard'
  return <Navigate to={`${prefix}/${type}/${slug}`} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeEntry />} />
      <Route path="/features" element={<Navigate to="/#features" replace />} />
      <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
      <Route path="/faq" element={<Navigate to="/#faq" replace />} />
      <Route
        path="/private-policy"
        element={
          <LandingLayout>
            <PrivatePolicy />
          </LandingLayout>
        }
      />
      <Route
        path="/terms"
        element={
          <LandingLayout>
            <Terms />
          </LandingLayout>
        }
      />

      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />

      <Route
        element={
          <ChatSessionProvider>
            <AppShell />
          </ChatSessionProvider>
        }
      >
        <Route path="/duo" element={<DuoLayout />}>
          <Route index element={<Overview />} />
          <Route path="players" element={<Players />} />
          <Route path="teams" element={<Teams />} />
          <Route path="champions" element={<Champions />} />
          <Route path="matchups" element={<Matchups />} />
          <Route path="tournaments" element={<Tournaments />} />
          <Route path="players/:slug" element={<PlayerPage />} />
          <Route path="teams/:slug" element={<TeamPage />} />
          <Route path="champions/:slug" element={<ChampionPage />} />
          <Route path="tournaments/:slug" element={<TournamentPage />} />
          <Route path="series/:seriesId" element={<SeriesPage />} />
        </Route>

        <Route path="/chat" element={<ChatPane />} />

        <Route path="/dashboard" element={<DashboardFrame />}>
          <Route index element={<Overview />} />
          <Route path="players" element={<Players />} />
          <Route path="teams" element={<Teams />} />
          <Route path="champions" element={<Champions />} />
          <Route path="matchups" element={<Matchups />} />
          <Route path="tournaments" element={<Tournaments />} />
          <Route path="players/:slug" element={<PlayerPage />} />
          <Route path="teams/:slug" element={<TeamPage />} />
          <Route path="champions/:slug" element={<ChampionPage />} />
          <Route path="tournaments/:slug" element={<TournamentPage />} />
          <Route path="series/:seriesId" element={<SeriesPage />} />
        </Route>

        <Route path="/profile" element={<UserProfile />} />
        <Route path="/contact" element={<Contact />} />
      </Route>

      <Route path="/nuckyai" element={<Navigate to="/chat" replace />} />
      <Route path="/live" element={<Navigate to="/dashboard" replace />} />
      <Route path="/live/:matchId" element={<Navigate to="/dashboard" replace />} />
      <Route path="/players" element={<Navigate to="/dashboard/players" replace />} />
      <Route path="/teams" element={<Navigate to="/dashboard/teams" replace />} />
      <Route path="/champions" element={<Navigate to="/dashboard/champions" replace />} />
      <Route path="/matchups" element={<Navigate to="/dashboard/matchups" replace />} />
      <Route path="/tournaments" element={<Navigate to="/dashboard/tournaments" replace />} />
      <Route path="/players/:slug" element={<LegacyEntityRedirect type="players" />} />
      <Route path="/teams/:slug" element={<LegacyEntityRedirect type="teams" />} />
      <Route path="/champions/:slug" element={<LegacyEntityRedirect type="champions" />} />
      <Route path="/tournaments/:slug" element={<LegacyEntityRedirect type="tournaments" />} />
      <Route
        path="/series/:seriesId"
        element={<LegacySeriesRedirect />}
      />
    </Routes>
  )
}

function LegacySeriesRedirect() {
  const { seriesId } = useParams()
  const { defaultView } = useViewPreference()
  const prefix = defaultView === 'duo' ? '/duo' : '/dashboard'
  return <Navigate to={`${prefix}/series/${seriesId}`} replace />
}

function App() {
  return (
    <AuthProvider>
      <TimezoneProvider>
        <ProfileProvider>
          <ViewPreferenceProvider>
            <DashboardProvider>
              <SmoothScroll>
                <AppRoutes />
              </SmoothScroll>
            </DashboardProvider>
          </ViewPreferenceProvider>
        </ProfileProvider>
      </TimezoneProvider>
    </AuthProvider>
  )
}

export default App
