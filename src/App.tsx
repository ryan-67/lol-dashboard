import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DashboardProvider } from './context/DashboardContext'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Players from './pages/Players'
import Teams from './pages/Teams'
import Champions from './pages/Champions'
import Matchups from './pages/Matchups'
import NuckyAI from './pages/NuckyAI'
import AuthCallback from './pages/AuthCallback'
import ResetPassword from './pages/ResetPassword'

gsap.registerPlugin(ScrollTrigger)

function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      smoothWheel: true,
    })

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
    }
  }, [])

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <DashboardProvider>
        <SmoothScroll>
          <Layout>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/players" element={<Players />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/champions" element={<Champions />} />
              <Route path="/matchups" element={<Matchups />} />
              <Route path="/nuckyai" element={<NuckyAI />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
            </Routes>
          </Layout>
        </SmoothScroll>
      </DashboardProvider>
    </AuthProvider>
  )
}

export default App
