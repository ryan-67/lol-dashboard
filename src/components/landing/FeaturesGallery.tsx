import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion, scrambleText } from './motion'
import imgPom from '../assets/pom.png'
import imgMatchup from '../assets/matchup.png'
import imgModel from '../assets/prediction_model.png'
import fakerVideo from '../assets/faker_vid.mp4'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface Chapter {
  key: string
  index: string
  kicker: string
  title: string
  body: string
  specs: string[]
}

const CHAPTERS: Chapter[] = [
  {
    key: 'dashboard',
    index: '01',
    kicker: 'the dashboard',
    title: 'every tier-1 stage, instrumented',
    body: 'Radars, form curves, matchup history, and player spotlights across LCK, LPL, LEC, and LCS — free to browse, no account required.',
    specs: ['players · teams · champions', 'league / year / split filters', 'auto-refreshing pro data'],
  },
  {
    key: 'model',
    index: '02',
    kicker: 'the prediction model',
    title: 'a report card, not a gut feeling',
    body: 'A walk-forward engine retrained after every match day and scored only on series it has never seen. Accuracy and log-loss, published for anyone to audit.',
    specs: ['win probability + confidence', 'draft edges · win conditions', 'out-of-fold, never curve-fit'],
  },
  {
    key: 'analyst',
    index: '03',
    kicker: 'the ai analyst',
    title: 'ask it why. it shows receipts.',
    body: 'nucky answers from retrieved evidence — twelve years of matches, ratings, and drafts — and says when the evidence is not there.',
    specs: ['retrieval-grounded answers', 'prediction packets with drivers', 'twelve years of memory'],
  },
]

/**
 * Features gallery — a pinned horizontal chapter walk through the real
 * product. The track scrubs sideways while media counter-parallaxes and
 * chapter copy locks in per panel. Mobile / reduced motion fall back to a
 * vertical stack.
 */
export default function FeaturesGallery() {
  const rootRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const video = videoRef.current

      if (reducedMotion()) {
        video?.pause()
        return
      }

      const mm = gsap.matchMedia()

      mm.add('(min-width: 900px)', () => {
        const track = root.querySelector<HTMLElement>('.fg-track')
        const stage = root.querySelector<HTMLElement>('.fg-stage')
        const rail = root.querySelector<HTMLElement>('.fg-rail-fill')
        const counter = root.querySelector<HTMLElement>('.fg-counter-current')
        if (!track || !stage) return

        const distance = () => track.scrollWidth - window.innerWidth

        const scrub = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${distance()}`,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (rail) gsap.set(rail, { scaleX: self.progress })
              if (counter) {
                const idx = Math.min(
                  CHAPTERS.length,
                  Math.floor(self.progress * CHAPTERS.length) + 1,
                )
                const label = `0${idx}`
                if (counter.textContent !== label) counter.textContent = label
              }
            },
          },
        })

        const panels = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.fg-panel'))

        panels.forEach((panel) => {
          /* Media counter-parallax inside each frame — the image travels
           * against the track so the window feels dimensional. */
          panel.querySelectorAll<HTMLElement>('.fg-media-img').forEach((img) => {
            gsap.fromTo(
              img,
              { xPercent: -7 },
              {
                xPercent: 7,
                ease: 'none',
                scrollTrigger: {
                  trigger: panel,
                  containerAnimation: scrub,
                  start: 'left right',
                  end: 'right left',
                  scrub: true,
                },
              },
            )
          })

          /* Copy locks in as the chapter arrives. */
          const kicker = panel.querySelector<HTMLElement>('.fg-kicker span')
          const copyTl = gsap.timeline({
            scrollTrigger: {
              trigger: panel,
              containerAnimation: scrub,
              start: 'left 72%',
              once: true,
            },
          })
          copyTl
            .fromTo(
              panel.querySelector('.fg-frame'),
              { clipPath: 'inset(6% 12% 6% 12% round 10px)', scale: 0.985 },
              {
                clipPath: 'inset(0% 0% 0% 0% round 10px)',
                scale: 1,
                duration: 1.1,
                ease: 'power4.out',
              },
              0,
            )
            .fromTo(
              panel.querySelectorAll('.fg-copy > *'),
              { autoAlpha: 0, y: 30, filter: 'blur(7px)' },
              {
                autoAlpha: 1,
                y: 0,
                filter: 'blur(0px)',
                duration: 0.85,
                stagger: 0.09,
                ease: MOTION.easeOut,
                clearProps: 'filter',
              },
              0.15,
            )
            .fromTo(
              panel.querySelector('.fg-ghost'),
              { autoAlpha: 0, xPercent: 8 },
              { autoAlpha: 1, xPercent: 0, duration: 1.2, ease: 'power3.out' },
              0,
            )
            .add(() => {
              if (kicker) scrambleText(kicker, kicker.dataset.text || '', 0.9)
            }, 0.2)
        })

        /* Analyst video only spins while its chapter is on stage. */
        if (video) {
          const videoPanel = panels[panels.length - 1]
          const gate = ScrollTrigger.create({
            trigger: videoPanel,
            containerAnimation: scrub,
            start: 'left 95%',
            end: 'right 5%',
            onToggle: (self) => {
              if (self.isActive) void video.play().catch(() => undefined)
              else video.pause()
            },
          })
          return () => gate.kill()
        }
      })

      mm.add('(max-width: 899px)', () => {
        /* Vertical fallback — standard reveals, video plays on visibility. */
        if (video) {
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) void video.play().catch(() => undefined)
                else video.pause()
              })
            },
            { threshold: 0.35 },
          )
          observer.observe(video)
          return () => observer.disconnect()
        }
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  return (
    <section
      className="features-gallery"
      ref={rootRef}
      id="features"
      data-accent-hue="188"
      aria-label="What nucky is made of"
    >
      <div className="section-head landing-inner">
        <p className="section-label" data-reveal="blur-in">the instrument</p>
        <h2 className="section-title" data-motion-text>
          three instruments. one signal.
        </h2>
      </div>

      <div className="fg-stage">
        <div className="fg-track">
          {CHAPTERS.map((chapter) => (
            <article className={`fg-panel fg-panel--${chapter.key}`} key={chapter.key}>
              <span className="fg-ghost" aria-hidden="true">
                {chapter.index}
              </span>

              <div className="fg-media">
                {chapter.key === 'dashboard' ? (
                  <>
                    <div className="fg-frame fg-frame--main">
                      <img className="fg-media-img" src={imgPom} alt="nucky hub — player of the month spotlight" loading="lazy" />
                    </div>
                    <div className="fg-frame fg-frame--float" data-parallax-layer data-speed="-0.05">
                      <img className="fg-media-img" src={imgMatchup} alt="matchup comparison view" loading="lazy" />
                    </div>
                  </>
                ) : null}

                {chapter.key === 'model' ? (
                  <div className="fg-frame fg-frame--main">
                    <img className="fg-media-img" src={imgModel} alt="nucky prediction model interface" loading="lazy" />
                  </div>
                ) : null}

                {chapter.key === 'analyst' ? (
                  <div className="fg-frame fg-frame--main fg-frame--video">
                    <video
                      className="fg-media-img"
                      ref={videoRef}
                      src={fakerVideo}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label="nucky AI analyst conversation preview"
                    />
                  </div>
                ) : null}
              </div>

              <div className="fg-copy">
                <p className="fg-kicker">
                  <span data-text={chapter.kicker}>{chapter.kicker}</span>
                </p>
                <h3 className="fg-title">{chapter.title}</h3>
                <p className="fg-body">{chapter.body}</p>
                <ul className="fg-specs">
                  {chapter.specs.map((spec) => (
                    <li key={spec}>{spec}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <div className="fg-chrome" aria-hidden="true">
          <div className="fg-counter">
            <span className="fg-counter-current">01</span>
            <span className="fg-counter-total">/ 03</span>
          </div>
          <div className="fg-rail">
            <span className="fg-rail-fill" />
          </div>
          <span className="fg-hint">scroll</span>
        </div>
      </div>
    </section>
  )
}
