import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, reducedMotion, scrambleText } from './motion'
import imgPom from '../assets/pom.png'
import imgMatchup from '../assets/matchup.png'
import imgTeam from '../assets/team.png'
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
    title: 'current form, instrumented',
    body: 'Every chart reads from the model\u2019s scores \u2014 form curves, radars, matchup history, and player spotlights that show who is performing right now across LCK, LPL, LEC, and LCS. Not a stats archive; a live read on form.',
    specs: ['model-scored players · teams · champions', 'form curves · radars · rankings', 'free to browse, no account required'],
  },
  {
    key: 'model',
    index: '02',
    kicker: 'the prediction model — the core',
    title: 'one engine underneath it all',
    body: 'nucky is built on its prediction model. Trained on thousands of tier-1 games, it scores every match statistically and contextually \u2014 and everything else on the site reads from those scores. Accuracy and log-loss, published for anyone to audit.',
    specs: ['every tier-1 game scored', 'win probability + confidence', 'out-of-fold, never curve-fit'],
  },
  {
    key: 'analyst',
    index: '03',
    kicker: 'the ai analyst',
    title: 'ask it why. it shows receipts.',
    body: 'nucky answers from the model\u2019s scores and retrieved evidence \u2014 twelve years of matches, ratings, and drafts \u2014 and says when the evidence is not there.',
    specs: ['retrieval-grounded answers', 'prediction packets with drivers', 'twelve years of memory'],
  },
]

/**
 * Features gallery — the hero hands straight into this pinned horizontal
 * walk (no section head, alche-style): product frames ride the track as
 * angled 3D planes that flatten through center, media keeps its native
 * aspect ratio, and the whole stage stays transparent so the glass N and
 * atmosphere read through. Mobile / reduced motion fall back to a stack.
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
        if (!track || !stage) return

        const panels = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.fg-panel'))
        const medias = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.fg-media'))
        /* Alche gallery travel: the track starts one viewport to the right
         * (the stage pins empty, then chapter 01 rides in from the right
         * edge) and travels until the last panel fully exits off the left —
         * no content is left mid-viewport to "jump" at either end. */
        const entry = () => window.innerWidth
        const distance = () => track.scrollWidth + entry()

        gsap.set(track, { transformPerspective: 1500 })
        medias.forEach((media) => gsap.set(media, { transformPerspective: 1200 }))

        const scrub = gsap.fromTo(track, {
          x: () => entry(),
        }, {
          x: () => -track.scrollWidth,
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${distance()}`,
            scrub: MOTION.scrub,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: () => {
              /* 3D gallery physics — frames arrive angled toward the
               * viewer and flatten as they cross center (alche works). */
              const mid = window.innerWidth / 2
              panels.forEach((panel, i) => {
                const rect = panel.getBoundingClientRect()
                const off = gsap.utils.clamp(
                  -1,
                  1,
                  (rect.left + rect.width / 2 - mid) / mid,
                )
                gsap.set(medias[i]!, {
                  rotationY: off * 16,
                  z: -Math.abs(off) * 90,
                })
              })
            },
          },
        })

        panels.forEach((panel) => {
          /* Copy locks in as the chapter arrives. */
          const kicker = panel.querySelector<HTMLElement>('.fg-kicker span')
          const copyTl = gsap.timeline({
            scrollTrigger: {
              trigger: panel,
              containerAnimation: scrub,
              start: 'left 78%',
              once: true,
            },
          })
          copyTl
            .fromTo(
              panel.querySelectorAll('.fg-frame'),
              { clipPath: 'inset(8% 10% 8% 10% round 12px)', scale: 0.97 },
              {
                clipPath: 'inset(0% 0% 0% 0% round 12px)',
                scale: 1,
                duration: 1.1,
                stagger: 0.1,
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
                    <div className="fg-frame fg-frame--pom" data-tilt="3">
                      <img
                        className="fg-media-img"
                        src={imgPom}
                        alt="nucky hub — player of the month spotlight"
                        loading="lazy"
                      />
                    </div>
                    <div className="fg-frame fg-frame--team" data-tilt="4">
                      <img
                        className="fg-media-img"
                        src={imgTeam}
                        alt="team analytics view"
                        loading="lazy"
                      />
                    </div>
                    <div className="fg-frame fg-frame--matchup" data-tilt="4">
                      <img
                        className="fg-media-img"
                        src={imgMatchup}
                        alt="matchup comparison view"
                        loading="lazy"
                      />
                    </div>
                  </>
                ) : null}

                {chapter.key === 'model' ? (
                  <div className="fg-frame fg-frame--model" data-tilt="3">
                    <img
                      className="fg-media-img"
                      src={imgModel}
                      alt="nucky prediction model interface"
                      loading="lazy"
                    />
                  </div>
                ) : null}

                {chapter.key === 'analyst' ? (
                  <div className="fg-frame fg-frame--video">
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
      </div>
    </section>
  )
}
