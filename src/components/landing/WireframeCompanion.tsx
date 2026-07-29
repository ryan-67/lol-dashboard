import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { reducedMotion } from './motion'
import fakerVideo from '../assets/faker_vid.mp4'
import frontBlack from './assets/faker-wireframe-front-black.png'
import quarterLeft from './assets/faker-wireframe-quarter-left.png'
import quarterRight from './assets/faker-wireframe-quarter-right.png'
import pointUp from './assets/faker-wireframe-point-up.png'
import pointDown from './assets/faker-wireframe-point-down.png'
import pointLeft from './assets/faker-wireframe-point-left.png'
import pointRight from './assets/faker-wireframe-point-right.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type Pose =
  | 'front'
  | 'point-up'
  | 'point-down'
  | 'point-left'
  | 'point-right'
  | 'hide'

/**
 * The persistent Faker wireframe that narrates the scroll story.
 *
 * One fixed overlay, all directional wireframe renders stacked inside it.
 * A single master scrubbed timeline (normalized 0→1 across the whole page)
 * crossfades between poses and slides the stage toward each section's
 * content. Checkpoints are declared by sections via data attributes:
 *
 *   data-companion="point-left"      pose for this section
 *   data-companion-x="-30"           stage translateX in vw
 *   data-companion-y="6"             stage translateY in vh
 *   data-companion-scale="0.55"      stage scale
 *   data-companion-opacity="0.9"     stage opacity
 */
export default function WireframeCompanion() {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLImageElement>(null)
  const quarterLeftRef = useRef<HTMLImageElement>(null)
  const quarterRightRef = useRef<HTMLImageElement>(null)
  const handRefs = useRef<Record<string, HTMLImageElement | null>>({})

  useGSAP(
    () => {
      const stage = stageRef.current
      const head = headRef.current
      if (!stage || !head || reducedMotion()) return

      const poseTarget = (pose: Pose): Element | null => {
        if (pose === 'front') return head
        if (pose === 'hide') return null
        return handRefs.current[pose] ?? null
      }

      const mm = gsap.matchMedia()
      let master: gsap.core.Timeline | null = null
      let breathing: gsap.core.Timeline | null = null
      let heroGate: ScrollTrigger | null = null

      mm.add('(min-width: 769px)', () => {
        /* Ambient idle — runs on the inner float layer so it composes
         * additively with the scroll-driven stage transforms. */
        const float = stage.querySelector('.wf-float')
        const floatTween = gsap.to(float, {
          y: -14,
          duration: 3.6,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })

        /* Breathing head drift while idle in the hero: subtle crossfades
         * between the front pose and the two quarter-angle renders. */
        breathing = gsap
          .timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } })
          .to({}, { duration: 2.2 })
          .to(quarterLeftRef.current, { autoAlpha: 0.85, duration: 1.6 })
          .to(frontRef.current, { autoAlpha: 0.3, duration: 1.6 }, '<')
          .to({}, { duration: 1.6 })
          .to(quarterLeftRef.current, { autoAlpha: 0, duration: 1.5 })
          .to(frontRef.current, { autoAlpha: 1, duration: 1.5 }, '<')
          .to({}, { duration: 2.0 })
          .to(quarterRightRef.current, { autoAlpha: 0.85, duration: 1.6 })
          .to(frontRef.current, { autoAlpha: 0.3, duration: 1.6 }, '<')
          .to({}, { duration: 1.6 })
          .to(quarterRightRef.current, { autoAlpha: 0, duration: 1.5 })
          .to(frontRef.current, { autoAlpha: 1, duration: 1.5 }, '<')

        /* Gate the breathing loop to the hero. Past it, snap the head group
         * back to the clean front render so master crossfades stay coherent. */
        heroGate = ScrollTrigger.create({
          start: 0,
          end: () => window.innerHeight * 0.35,
          onLeave: () => {
            breathing?.pause()
            gsap.to([quarterLeftRef.current, quarterRightRef.current], {
              autoAlpha: 0,
              duration: 0.3,
            })
            gsap.to(frontRef.current, { autoAlpha: 1, duration: 0.3 })
          },
          onEnterBack: () => {
            breathing?.resume()
          },
        })

        const buildMaster = () => {
          master?.scrollTrigger?.kill()
          master?.kill()

          const sections = gsap.utils.toArray<HTMLElement>('[data-companion]')
          if (!sections.length) return

          const doc = document.documentElement
          const total = Math.max(doc.scrollHeight - window.innerHeight, 1)
          const vw = window.innerWidth / 100
          const vh = window.innerHeight / 100
          /* Crossfade window ≈ 0.75 viewport of scroll, in normalized time. */
          const fadeWin = Math.min((window.innerHeight * 0.75) / total, 0.09)

          master = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: document.body,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 1.1,
            },
          })
          /* Pad the timeline so its duration is exactly 1 normalized unit. */
          master.set({}, {}, 1)

          let prevPose: Pose = 'front'

          sections.forEach((el, index) => {
            const rect = el.getBoundingClientRect()
            const elTop = rect.top + window.scrollY
            const at = gsap.utils.clamp(
              0.0001,
              1 - fadeWin,
              (elTop - window.innerHeight * 0.6) / total,
            )
            const pose = (el.dataset.companion || 'hide') as Pose
            const x = Number(el.dataset.companionX || 0) * vw
            const y = Number(el.dataset.companionY || 0) * vh
            const scale = Number(el.dataset.companionScale || 1)
            const opacity = Number(
              el.dataset.companionOpacity ?? (pose === 'hide' ? 0 : 1),
            )

            master!.addLabel(`section-${index}`, at)

            if (pose !== prevPose) {
              const from = poseTarget(prevPose)
              const to = poseTarget(pose)
              if (from) master!.to(from, { autoAlpha: 0, duration: fadeWin }, at)
              if (to) master!.to(to, { autoAlpha: 1, duration: fadeWin }, at)
            }

            /* Positional gesture — slightly longer than the crossfade so the
             * fade + slide read as one continuous movement, not a cut. */
            master!.to(
              stage,
              { x, y, scale, autoAlpha: opacity, duration: fadeWin * 1.5 },
              at,
            )

            prevPose = pose
          })
        }

        /* Build after pinned sections have installed their spacers so the
         * measured offsets are final. Rebuild on resize. */
        const buildTimer = window.setTimeout(buildMaster, 300)
        const handleLoad = () => buildMaster()
        window.addEventListener('load', handleLoad)

        let resizeTimer = 0
        const handleResize = () => {
          window.clearTimeout(resizeTimer)
          resizeTimer = window.setTimeout(buildMaster, 320)
        }
        window.addEventListener('resize', handleResize)

        return () => {
          window.clearTimeout(buildTimer)
          window.clearTimeout(resizeTimer)
          window.removeEventListener('load', handleLoad)
          window.removeEventListener('resize', handleResize)
          floatTween.kill()
          breathing?.kill()
          heroGate?.kill()
          master?.scrollTrigger?.kill()
          master?.kill()
          master = null
        }
      })

      mm.add('(max-width: 768px)', () => {
        /* Mobile: the companion lives in the hero only (CSS pins it there).
         * Keep a gentle float; skip the master arc entirely. */
        const float = stage.querySelector('.wf-float')
        const floatTween = gsap.to(float, {
          y: -10,
          duration: 3.8,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
        return () => {
          floatTween.kill()
        }
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  const reduce = reducedMotion()

  return (
    <div
      className={`wf-companion${reduce ? ' wf-companion--static' : ''}`}
      ref={rootRef}
      aria-hidden="true"
    >
      <div className="wf-stage" ref={stageRef}>
        <div className="wf-float">
          <div className="wf-glow" />
          <div className="wf-head" ref={headRef}>
            {!reduce ? (
              <video
                className="wf-video"
                src={fakerVideo}
                autoPlay
                muted
                loop
                playsInline
              />
            ) : null}
            <img className="wf-img wf-img--front" src={frontBlack} alt="" ref={frontRef} />
            <img
              className="wf-img wf-img--quarter"
              src={quarterLeft}
              alt=""
              ref={quarterLeftRef}
              style={{ opacity: 0, visibility: 'hidden' }}
            />
            <img
              className="wf-img wf-img--quarter"
              src={quarterRight}
              alt=""
              ref={quarterRightRef}
              style={{ opacity: 0, visibility: 'hidden' }}
            />
          </div>
          {(
            [
              ['point-up', pointUp],
              ['point-down', pointDown],
              ['point-left', pointLeft],
              ['point-right', pointRight],
            ] as const
          ).map(([pose, src]) => (
            <img
              key={pose}
              className={`wf-img wf-img--hand wf-img--${pose}`}
              src={src}
              alt=""
              ref={(el) => {
                handRefs.current[pose] = el
              }}
              style={{ opacity: 0, visibility: 'hidden' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
