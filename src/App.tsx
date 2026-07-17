import { useEffect, useRef } from 'react'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DashboardProvider } from './context/DashboardContext'
import { AuthProvider } from './context/AuthContext'
import { TimezoneProvider } from './context/TimezoneContext'
import Layout from './components/Layout'
import LandingLayout from './components/landing/LandingLayout'
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
import NuckyAI from './pages/NuckyAI'
import Live from './pages/Live'
import LiveMatchRoom from './pages/LiveMatchRoom'
import PrivatePolicy from './pages/PrivatePolicy'
import Terms from './pages/Terms'
import UserProfile from './pages/UserProfile'
import AuthCallback from './pages/AuthCallback'
import ResetPassword from './pages/ResetPassword'

gsap.registerPlugin(ScrollTrigger)

const MARKETING_PATHS = new Set([
  '/',
  '/features',
  '/pricing',
  '/faq',
  '/private-policy',
  '/terms',
])

function SmoothScroll({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    const lenis = lenisRef.current
    if (lenis) {
      lenis.scrollTo(0, { immediate: true })
    } else {
      window.scrollTo(0, 0)
    }
    ScrollTrigger.refresh()
  }, [location.pathname])

  return <>{children}</>
}

function MarketingRoutes() {
  return (
    <LandingLayout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<Navigate to="/#features" replace />} />
        <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
        <Route path="/faq" element={<Navigate to="/#faq" replace />} />
        <Route path="/private-policy" element={<PrivatePolicy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </LandingLayout>
  )
}

function AppShellRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Overview />} />
        <Route path="/players" element={<Players />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/champions" element={<Champions />} />
        <Route path="/matchups" element={<Matchups />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/players/:slug" element={<PlayerPage />} />
        <Route path="/teams/:slug" element={<TeamPage />} />
        <Route path="/champions/:slug" element={<ChampionPage />} />
        <Route path="/tournaments/:slug" element={<TournamentPage />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/nuckyai" element={<NuckyAI />} />
        <Route path="/live" element={<Live />} />
        <Route path="/live/:matchId" element={<LiveMatchRoom />} />
        <Route path="/profile" element={<UserProfile />} />
      </Routes>
    </Layout>
  )
}

function AppRoutes() {
  const location = useLocation()
  const isMarketing = MARKETING_PATHS.has(location.pathname)

  if (location.pathname === '/auth/callback') {
    return <AuthCallback />
  }
  if (location.pathname === '/auth/reset-password') {
    return <ResetPassword />
  }

  return isMarketing ? <MarketingRoutes /> : <AppShellRoutes />
}

function App() {
  return (
    <AuthProvider>
      <TimezoneProvider>
        <DashboardProvider>
          <SmoothScroll>
            <AppRoutes />
          </SmoothScroll>
        </DashboardProvider>
      </TimezoneProvider>
    </AuthProvider>
  )
}

export default App
