import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import AuthModal from '../components/AuthModal'
import Preloader from '../components/landing/Preloader'
import CursorTrail from '../components/landing/CursorTrail'
import LetterGlitch from '../components/landing/LetterGlitch'
import HeroSection from '../components/landing/HeroSection'
import FeaturesGallery from '../components/landing/FeaturesGallery'
import KnowsSection from '../components/landing/KnowsSection'
import CoverageSection from '../components/landing/CoverageSection'
import ProofGallery from '../components/landing/ProofGallery'
import PricingSection from '../components/landing/PricingSection'
import FaqSection from '../components/landing/FaqSection'
import FinalCtaSection from '../components/landing/FinalCtaSection'
import {
  coarsePointer,
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

/* Heavy R3F chunk — the persistent glass N scene behind the whole page. */
const HeroN = lazy(() => import('../components/landing/HeroN'))

type AuthView = 'signin' | 'signup'

export default function Landing() {
  const { user } = useAuth()
  const { homePath } = useViewPreference()
  const location = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)

  /* Scene progress refs — read every frame by the R3F loop, written by
   * ScrollTriggers here. No React re-renders on scroll. */
  const heroProgressRef = useRef(0)
  const pageProgressRef = useRef(0)

  const [introDone, setIntroDone] = useState(false)
  const [scorecard, setScorecard] = useState<AccuracyScorecard | null>(null)
  const [modelUpdatedIso, setModelUpdatedIso] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState<AuthView>('signin')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const reduce = reducedMotion()
  const compactScene = coarsePointer()

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

  /* Persistent scene choreography: hero progress spins the N to the right
   * as the story arrives; page progress keeps it rotating in place; the
   * layer itself dims to a faint presence once the hero hands off. */
  useGSAP(
    () => {
      const root = rootRef.current
      const scene = sceneRef.current
      if (!root || !scene || reduce) return

      const hero = root.querySelector<HTMLElement>('.hero')
      if (hero) {
        ScrollTrigger.create({
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            heroProgressRef.current = self.progress
          },
        })
      }

      ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          pageProgressRef.current = self.progress
        },
      })

      /* Faint persistence — full presence in the hero, ~1/4 strength for
       * the rest of the story so section content stays readable. */
      gsap.fromTo(
        scene,
        { opacity: 1 },
        {
          opacity: 0.24,
          ease: 'none',
          scrollTrigger: {
            trigger: hero ?? root,
            start: 'center top',
            end: 'bottom top',
            scrub: true,
          },
        },
      )
    },
    { scope: rootRef, dependencies: [reduce] },
  )

  /* Page-wide motion systems: kinetic text, reveal presets, parallax,
   * magnetic + tilt hover, accent atmosphere. Section choreography lives
   * inside each section component. */
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
        <LetterGlitch />
      </div>

      {/* Persistent glass N scene — fixed behind every section, faint after
       * the hero, rotating with scroll as the transition catalyst. */}
      <div
        className={`landing-scene${introDone ? ' is-live' : ''}`}
        ref={sceneRef}
        aria-hidden="true"
      >
        {reduce ? (
          <div className="hero-static">
            <span className="hero-static-mark">
              N<span className="hero-static-dot">.</span>
            </span>
          </div>
        ) : (
          <Suspense fallback={null}>
            <HeroN heroRef={heroProgressRef} pageRef={pageProgressRef} compact={compactScene} />
          </Suspense>
        )}
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

        <CoverageSection />

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
