import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import AuthModal from '../components/AuthModal'
import Preloader from '../components/landing/Preloader'
import CursorTrail from '../components/landing/CursorTrail'
import HeroSection from '../components/landing/HeroSection'
import FeaturesGallery from '../components/landing/FeaturesGallery'
import KnowsSection from '../components/landing/KnowsSection'
import ProofGallery from '../components/landing/ProofGallery'
import PricingSection from '../components/landing/PricingSection'
import FaqSection from '../components/landing/FaqSection'
import FinalCtaSection from '../components/landing/FinalCtaSection'
import {
  getLandingLenis,
  initAccentDrift,
  initLandingLenis,
  initMagnetic,
  initParallaxLayers,
  initScrollReveals,
  initTextReveals,
  initTiltHover,
  reducedMotion,
} from '../components/landing/motion'
import { useViewPreference } from '../context/ViewPreferenceContext'
import { useAuth } from '../context/AuthContext'
import { fetchAccuracyScorecard, type AccuracyScorecard } from '../lib/accuracyScorecard'
import { fetchModelMetadata } from '../lib/loadModelMetadata'
import { formatModelUpdatedDate } from '../lib/format'
import { DEFAULT_TIMEZONE } from '../lib/timezones'
import { startStripeCheckout } from '../lib/billing'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type AuthView = 'signin' | 'signup'

export default function Landing() {
  const { user } = useAuth()
  const { homePath } = useViewPreference()
  const location = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)

  const [introDone, setIntroDone] = useState(false)
  const [scorecard, setScorecard] = useState<AccuracyScorecard | null>(null)
  const [modelUpdatedIso, setModelUpdatedIso] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  /* Silky document scroll — Lenis driven through the GSAP ticker. */
  useEffect(() => initLandingLenis(), [])

  /* Live scorecard + model metadata. */
  useEffect(() => {
    let alive = true
    const load = (force = false) => {
      void fetchAccuracyScorecard({ force }).then((data) => {
        if (alive) setScorecard(data)
      })
      void fetchModelMetadata({ force }).then((meta) => {
        if (!alive) return
        if (meta?.exported_at) setModelUpdatedIso(meta.exported_at)
      })
    }
    load()
    const onVis = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  /* Hash deep links (/#pricing etc) — respect pinned sections via Lenis. */
  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (!target) return
      const lenis = getLandingLenis()
      if (lenis) lenis.scrollTo(target, { offset: -8, duration: 1.1 })
      else target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash])

  /* Page-wide motion systems: kinetic text, reveal presets, parallax,
   * magnetic + tilt hover, accent atmosphere, footer handoff. Section
   * choreography lives inside each section component. */
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      initTextReveals(root)
      initScrollReveals(root)
      initParallaxLayers(root)
      const cleanupMagnetic = initMagnetic(root)
      const cleanupTilt = initTiltHover(root)
      const cleanupAccent = initAccentDrift(root)

      /* Footer parallax handoff (footer lives in LandingLayout). */
      const footer = document.querySelector('.landing-footer')
      if (footer && !reducedMotion()) {
        gsap.fromTo(
          footer,
          { yPercent: -10, autoAlpha: 0.75 },
          {
            yPercent: 0,
            autoAlpha: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: footer,
              start: 'top bottom',
              end: 'top 55%',
              scrub: 1,
            },
          },
        )
      }

      const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 450)
      return () => {
        window.clearTimeout(refreshTimer)
        cleanupMagnetic?.()
        cleanupTilt()
        cleanupAccent()
      }
    },
    { scope: rootRef },
  )

  const openAuth = (view: AuthView) => {
    setAuthView(view)
    setShowAuth(true)
  }

  const handleSubscribe = async () => {
    setCheckoutError(null)
    if (!user) {
      openAuth('signup')
      return
    }
    setCheckoutLoading(true)
    try {
      const url = await startStripeCheckout()
      window.location.assign(url)
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'checkout failed')
      setCheckoutLoading(false)
    }
  }

  const scorecardUpdated = formatModelUpdatedDate(modelUpdatedIso ?? scorecard?.generatedAt, {
    timeZone: DEFAULT_TIMEZONE,
  })

  return (
    <div className="landing-page" ref={rootRef}>
      <Preloader onComplete={() => setIntroDone(true)} />
      <CursorTrail />

      {/* Ambient depth layers behind everything. */}
      <div className="landing-ambient" aria-hidden="true">
        <div className="landing-ambient-grid" />
        <div className="landing-ambient-glow" data-parallax-layer data-speed="-0.08" />
      </div>

      <div className="landing-content">
        <HeroSection
          introDone={introDone}
          signedIn={Boolean(user)}
          homePath={homePath}
          onCreateAccount={() => openAuth('signup')}
        />

        <FeaturesGallery />

        <KnowsSection />

        <ProofGallery scorecard={scorecard} updatedLabel={scorecardUpdated ?? null} />

        <PricingSection
          signedIn={Boolean(user)}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          onSubscribe={() => void handleSubscribe()}
        />

        <FaqSection />

        <FinalCtaSection
          signedIn={Boolean(user)}
          homePath={homePath}
          onCreateAccount={() => openAuth('signup')}
        />
      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialView={authView} />
    </div>
  )
}
