import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { applyBlackToAlpha, blackToAlpha, reducedMotion } from './motion'
import fakerVideo from '../assets/faker_vid.mp4'
import frontBlack from './assets/faker-wireframe-front-black.png'
import pointUp from './assets/faker-wireframe-point-up.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type Pose = 'front' | 'point-up' | 'hide'

const VIDEO_MAX_WIDTH = 480

/**
 * The persistent Faker wireframe that narrates the scroll story.
 *
 * Fixed overlay, centered on the viewport (anime.js-style centerpiece).
 * Renders are processed at runtime from matte-black plates into true alpha.
 *
 * Arc:
 *   1. Hero — full front wireframe + ambient video
 *   2. Knows onward — head dissolves, finger stays pointing UP
 *   3. Finale — head + ambient video return over the up finger
 *
 * Sections declare checkpoints with data attributes:
 *   data-companion="point-up"       pose (front | point-up | hide)
 *   data-companion-x="0"            stage translateX in vw (from center)
 *   data-companion-y="32"           stage translateY in vh
 *   data-companion-scale="0.4"      stage scale
 *   data-companion-opacity="0.85"   stage opacity
 */
export default function WireframeCompanion() {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLImageElement>(null)
  const pointUpRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    void hydrate(pointUpRef.current, pointUp)

    return () => {
      alive = false
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  /* Ambient video on the full wireframe — hero + finale. */
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
    let videoActive = true
    let alive = true
    let cropX = 0
    let cropY = 0
    let cropSize = 0

    const setActive = (next: boolean) => {
      videoActive = next
      if (next) {
        void video.play().catch(() => undefined)
      } else {
        video.pause()
      }
    }

    const renderFrame = () => {
      if (!alive) return
      if (videoActive && !document.hidden && video.readyState >= 2 && cropSize > 0) {
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

    /* Play while any full-wireframe section (hero or finale) owns the viewport. */
    const syncVideoGate = () => {
      const fronts = gsap.utils.toArray<HTMLElement>('[data-companion="front"]')
      const midY = window.innerHeight * 0.5
      const nearFront = fronts.some((el) => {
        const rect = el.getBoundingClientRect()
        return rect.top < midY + window.innerHeight * 0.35 && rect.bottom > midY - window.innerHeight * 0.35
      })
      setActive(nearFront || window.scrollY < window.innerHeight * 0.85)
    }

    const gate = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: syncVideoGate,
      onRefresh: syncVideoGate,
    })
    syncVideoGate()

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
      const hand = handRef.current
      if (!stage || !head || !hand || reducedMotion()) return

      gsap.set(hand, { autoAlpha: 0 })

      const mm = gsap.matchMedia()
      let master: gsap.core.Timeline | null = null

      mm.add('(min-width: 769px)', () => {
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
          master.set({}, {}, 1)

          let prevPose: Pose = 'front'

          sections.forEach((el, index) => {
            const rect = el.getBoundingClientRect()
            const elTop = rect.top + window.scrollY
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
              /* Head returns over the up-pointing finger — full circle. */
              master!.to(hand, { autoAlpha: 0, duration: fadeWin }, at)
              master!.to(head, { autoAlpha: 1, duration: fadeWin * 1.4 }, at)
              prevPose = 'front'
            } else if (pose === 'point-up') {
              if (prevPose === 'front') {
                master!.to(
                  head,
                  { autoAlpha: 0, duration: fadeWin, ease: 'power1.in' },
                  at,
                )
                master!.to(hand, { autoAlpha: 1, duration: fadeWin }, at)
              } else if (prevPose === 'hide') {
                master!.to(hand, { autoAlpha: 1, duration: fadeWin }, at)
              }
              prevPose = 'point-up'
            } else if (pose === 'hide') {
              /* Opacity-only fade; keep last pose in place. */
              prevPose = 'hide'
            }

            master!.to(
              stage,
              pose === 'hide'
                ? { autoAlpha: opacity, duration: fadeWin }
                : { x, y, scale, autoAlpha: opacity, duration: fadeWin * 1.5 },
              at,
            )
          })
        }

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
          <div className="wf-hand" ref={handRef}>
            <img className="wf-img wf-img--hand" alt="" ref={pointUpRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
