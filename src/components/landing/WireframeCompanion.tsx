import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { applyBlackToAlpha, blackToAlpha, reducedMotion } from './motion'
import fakerVideo from '../assets/faker_vid.mp4'
import frontBlack from './assets/faker-wireframe-front-black.png'
import pointUp from './assets/faker-wireframe-point-up.png'
import pointDown from './assets/faker-wireframe-point-down.png'
import pointLeft from './assets/faker-wireframe-point-left.png'
import pointRight from './assets/faker-wireframe-point-right.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type HandPose = 'point-up' | 'point-right' | 'point-down' | 'point-left'
type Pose = 'front' | HandPose | 'hide'

/** Clockwise rotor angle each hand render natively represents. */
const HAND_ANGLE: Record<HandPose, number> = {
  'point-up': 0,
  'point-right': 90,
  'point-down': 180,
  'point-left': 270,
}

const HAND_SOURCES: Record<HandPose, string> = {
  'point-up': pointUp,
  'point-right': pointRight,
  'point-down': pointDown,
  'point-left': pointLeft,
}

const VIDEO_MAX_WIDTH = 480

/**
 * The persistent Faker wireframe that narrates the scroll story.
 *
 * A fixed overlay centered on the viewport (anime.js-style centerpiece).
 * All renders are processed at runtime from matte-black plates into truly
 * transparent images (luminance → alpha), so they sit seamlessly on the page.
 *
 * The pointing hand lives on a rotor: each hand render is counter-rotated by
 * its native angle, so scrubbing the rotor clockwise (0° → 90° → 180° → …)
 * sweeps the finger through up → right → down → left while crossfading to the
 * dedicated render — both images always point the same direction mid-flight.
 *
 * Sections declare checkpoints with data attributes:
 *   data-companion="point-right"    pose (front | point-* | hide)
 *   data-companion-x="-36"          stage translateX in vw (from center)
 *   data-companion-y="30"           stage translateY in vh
 *   data-companion-scale="0.4"      stage scale
 *   data-companion-opacity="0.8"    stage opacity
 */
export default function WireframeCompanion() {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const rotorRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handRefs = useRef<Record<string, HTMLImageElement | null>>({})

  /* Process the matte-black renders into transparent images. */
  useEffect(() => {
    let alive = true
    const blobUrls: string[] = []

    const hydrate = async (img: HTMLImageElement | null, src: string) => {
      if (!img) return
      const url = await blackToAlpha(src)
      if (!alive) {
        URL.revokeObjectURL(url)
        return
      }
      blobUrls.push(url)
      img.src = url
      img.classList.add('is-ready')
    }

    void hydrate(frontRef.current, frontBlack)
    ;(Object.keys(HAND_SOURCES) as HandPose[]).forEach((pose) => {
      void hydrate(handRefs.current[pose] ?? null, HAND_SOURCES[pose])
    })

    return () => {
      alive = false
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  /* Ambient hero video, black-removed per frame onto a transparent canvas. */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion() || !window.matchMedia('(min-width: 769px)').matches) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const video = document.createElement('video')
    video.src = fakerVideo
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'

    let rafId = 0
    let heroActive = true
    let alive = true
    /* Center-crop the (landscape) video to a square so it overlays the
     * square wireframe render exactly. */
    let cropX = 0
    let cropY = 0
    let cropSize = 0

    const renderFrame = () => {
      if (!alive) return
      if (heroActive && !document.hidden && video.readyState >= 2 && cropSize > 0) {
        ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        applyBlackToAlpha(frame.data)
        ctx.putImageData(frame, 0, 0)
      }
      rafId = window.requestAnimationFrame(renderFrame)
    }

    const handleMeta = () => {
      cropSize = Math.min(video.videoWidth, video.videoHeight)
      cropX = (video.videoWidth - cropSize) / 2
      cropY = (video.videoHeight - cropSize) / 2
      const size = Math.min(VIDEO_MAX_WIDTH, cropSize || VIDEO_MAX_WIDTH)
      canvas.width = Math.max(2, size)
      canvas.height = Math.max(2, size)
      void video.play().catch(() => undefined)
      rafId = window.requestAnimationFrame(renderFrame)
    }
    video.addEventListener('loadedmetadata', handleMeta)

    /* Only burn cycles while the hero (where the head lives) is on screen. */
    const gate = ScrollTrigger.create({
      start: 0,
      end: () => window.innerHeight * 0.9,
      onLeave: () => {
        heroActive = false
        video.pause()
      },
      onEnterBack: () => {
        heroActive = true
        void video.play().catch(() => undefined)
      },
    })

    return () => {
      alive = false
      window.cancelAnimationFrame(rafId)
      video.removeEventListener('loadedmetadata', handleMeta)
      video.pause()
      video.src = ''
      gate.kill()
    }
  }, [])

  useGSAP(
    () => {
      const stage = stageRef.current
      const head = headRef.current
      const rotor = rotorRef.current
      if (!stage || !head || !rotor || reducedMotion()) return

      /* Counter-rotate each hand render so rotor angle N shows the native
       * pose for N upright. Start hidden except the up hand. */
      ;(Object.keys(HAND_ANGLE) as HandPose[]).forEach((pose) => {
        const img = handRefs.current[pose]
        if (!img) return
        gsap.set(img, {
          rotation: -HAND_ANGLE[pose],
          autoAlpha: pose === 'point-up' ? 1 : 0,
        })
      })
      gsap.set(rotor, { autoAlpha: 0, rotation: 0 })

      const mm = gsap.matchMedia()
      let master: gsap.core.Timeline | null = null

      mm.add('(min-width: 769px)', () => {
        /* Ambient idle — composes additively with scroll-driven transforms. */
        const float = stage.querySelector('.wf-float')
        const floatTween = gsap.to(float, {
          y: -14,
          duration: 3.6,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
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
          /* Transition window ≈ 0.85 viewport of scroll, normalized. */
          const fadeWin = Math.min((window.innerHeight * 0.85) / total, 0.08)

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
          let prevHand: HandPose = 'point-up'
          let angle = 0

          sections.forEach((el, index) => {
            const rect = el.getBoundingClientRect()
            const elTop = rect.top + window.scrollY
            /* Checkpoint lands when the section reaches viewport center. */
            const at = gsap.utils.clamp(
              0.0001,
              1 - fadeWin,
              (elTop - window.innerHeight * 0.5) / total,
            )
            const pose = (el.dataset.companion || 'hide') as Pose
            const x = Number(el.dataset.companionX || 0) * vw
            const y = Number(el.dataset.companionY || 0) * vh
            const scale = Number(el.dataset.companionScale || 1)
            const opacity = Number(
              el.dataset.companionOpacity ?? (pose === 'hide' ? 0 : 1),
            )

            master!.addLabel(`section-${index}`, at)

            if (pose === 'front' && prevPose !== 'front') {
              /* The head returns over the up-pointing finger — full circle. */
              master!.to(rotor, { autoAlpha: 0, duration: fadeWin }, at)
              master!.to(head, { autoAlpha: 1, duration: fadeWin * 1.4 }, at)
              prevPose = 'front'
            } else if (pose !== 'front' && pose !== 'hide') {
              if (prevPose === 'front') {
                /* Head dissolves upward, leaving only the pointing finger. */
                master!.to(
                  head,
                  { autoAlpha: 0, duration: fadeWin, ease: 'power1.in' },
                  at,
                )
                master!.to(rotor, { autoAlpha: 1, duration: fadeWin }, at)
              }

              /* Strictly clockwise rotor sweep to the next direction. */
              let target = HAND_ANGLE[pose]
              while (target < angle) target += 360

              if (target !== angle) {
                master!.to(
                  rotor,
                  { rotation: target, duration: fadeWin * 1.6, ease: 'power2.inOut' },
                  at,
                )
                if (pose !== prevHand) {
                  master!.to(
                    handRefs.current[prevHand],
                    { autoAlpha: 0, duration: fadeWin * 1.6 },
                    at,
                  )
                  master!.to(
                    handRefs.current[pose],
                    { autoAlpha: 1, duration: fadeWin * 1.6 },
                    at,
                  )
                }
                angle = target
                prevHand = pose
              }
              prevPose = pose
            }

            /* Positional gesture — slightly longer than the crossfade so the
             * fade + slide read as one continuous movement. Hidden
             * checkpoints only fade, keeping the last pose in place. */
            master!.to(
              stage,
              pose === 'hide'
                ? { autoAlpha: opacity, duration: fadeWin }
                : { x, y, scale, autoAlpha: opacity, duration: fadeWin * 1.5 },
              at,
            )
          })
        }

        /* Build after pinned sections install their spacers; rebuild on resize. */
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
          master?.scrollTrigger?.kill()
          master?.kill()
          master = null
        }
      })

      mm.add('(max-width: 768px)', () => {
        /* Mobile: the companion lives in the hero only (CSS pins it there). */
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
            <img className="wf-img wf-img--front" alt="" ref={frontRef} />
            {!reduce ? <canvas className="wf-video-canvas" ref={canvasRef} /> : null}
          </div>
          <div className="wf-rotor" ref={rotorRef}>
            {(Object.keys(HAND_SOURCES) as HandPose[]).map((pose) => (
              <img
                key={pose}
                className={`wf-img wf-img--hand wf-img--${pose}`}
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
    </div>
  )
}
