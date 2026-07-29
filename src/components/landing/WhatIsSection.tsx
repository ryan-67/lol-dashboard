import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { reducedMotion, scrambleText } from './motion'
import imgDashboard from './assets/whatis-dashboard.png'
import imgModel from './assets/whatis-model.png'
import imgAnalyst from './assets/whatis-analyst.png'
import imgSpine from './assets/whatis-spine.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface Slide {
  key: string
  image: string
  number: string
  title: string
  description: string
  lines: [string, string]
}

const SLIDES: Slide[] = [
  {
    key: 'dashboard',
    image: imgDashboard,
    number: '01',
    title: 'the dashboard',
    description: 'free tier-1 analytics',
    lines: ['Radars, form curves, and matchup history —', 'every tier-1 league, free to browse.'],
  },
  {
    key: 'model',
    image: imgModel,
    number: '02',
    title: 'the prediction model',
    description: 'a public report card',
    lines: ['Walk-forward accuracy and log-loss,', 'published for anyone to audit.'],
  },
  {
    key: 'analyst',
    image: imgAnalyst,
    number: '03',
    title: 'the analyst agent',
    description: 'twelve years of memory',
    lines: ['Ask about a matchup — nucky answers', 'from retrieved evidence, not improvisation.'],
  },
  {
    key: 'spine',
    image: imgSpine,
    number: '04',
    title: 'the evidence spine',
    description: 'one shared signal',
    lines: ['Dashboard, model, and analyst all read', 'from the same spine of data.'],
  },
]

const TRANSITION = 1.15
const CLIP_FULL = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
const CLIP_TOP = 'polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)'
const CLIP_BOTTOM = 'polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)'

/**
 * "what is nucky" — pinned, scroll-driven slide deck adapted from the
 * animmaster_slider_5 reference: centered featured image with clip-path
 * wipes, scramble-text titles, dim fullscreen backdrop crossfade.
 * Mobile and reduced-motion fall back to a static stacked list (CSS-gated).
 */
export default function WhatIsSection() {
  const rootRef = useRef<HTMLElement>(null)
  const numberRef = useRef<HTMLSpanElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const descRef = useRef<HTMLParagraphElement>(null)
  const line1Ref = useRef<HTMLSpanElement>(null)
  const line2Ref = useRef<HTMLSpanElement>(null)
  const countRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      const slider = root.querySelector<HTMLElement>('.whatis-slider')
      if (!slider) return

      const frames = gsap.utils.toArray<HTMLElement>(slider.querySelectorAll('.whatis-frame'))
      const bgs = gsap.utils.toArray<HTMLElement>(slider.querySelectorAll('.whatis-bg-img'))

      const mm = gsap.matchMedia()

      mm.add('(min-width: 769px)', () => {
        const state = {
          index: 0,
          tl: null as gsap.core.Timeline | null,
          scrambles: [] as Array<gsap.core.Tween | null>,
        }

        frames.forEach((frame, i) => {
          gsap.set(frame, { autoAlpha: i === 0 ? 1 : 0, clipPath: CLIP_FULL, zIndex: i === 0 ? 2 : 1 })
        })
        bgs.forEach((bg, i) => gsap.set(bg, { autoAlpha: i === 0 ? 0.15 : 0 }))

        const goTo = (next: number) => {
          const current = state.index
          if (next === current) return
          const direction = next > current ? 'down' : 'up'
          state.index = next

          state.tl?.kill()
          state.scrambles.forEach((tween) => tween?.kill())

          const slide = SLIDES[next]!
          const inFrame = frames[next]!
          const outFrame = frames[current]!
          const inImg = inFrame.querySelector('img')
          const outImg = outFrame.querySelector('img')

          gsap.set(inFrame, {
            autoAlpha: 1,
            zIndex: 3,
            clipPath: direction === 'down' ? CLIP_TOP : CLIP_BOTTOM,
          })
          gsap.set(outFrame, { zIndex: 2 })
          gsap.set(inImg, { yPercent: direction === 'down' ? -42 : 42 })

          const tl = gsap.timeline({
            defaults: { duration: TRANSITION, ease: 'power4.inOut' },
            onComplete: () => {
              frames.forEach((frame, i) => {
                gsap.set(frame, { autoAlpha: i === next ? 1 : 0, zIndex: i === next ? 2 : 1 })
              })
              gsap.set(outImg, { yPercent: 0 })
            },
          })
          tl.to(inFrame, { clipPath: CLIP_FULL }, 0)
            .to(inImg, { yPercent: 0 }, 0)
            .to(outImg, { yPercent: direction === 'down' ? 30 : -30 }, 0)
            .to(bgs[current]!, { autoAlpha: 0 }, 0)
            .to(bgs[next]!, { autoAlpha: 0.15 }, 0)
          state.tl = tl

          state.scrambles = [
            scrambleText(numberRef.current, slide.number, 0.8),
            scrambleText(titleRef.current, slide.title, 1.1),
            scrambleText(descRef.current, slide.description, 0.9),
            scrambleText(line1Ref.current, slide.lines[0], 1.0),
            scrambleText(line2Ref.current, slide.lines[1], 1.0),
          ]

          if (countRef.current) countRef.current.textContent = `${slide.number} / 04`
        }

        const trigger = ScrollTrigger.create({
          trigger: slider,
          start: 'top top',
          end: `+=${SLIDES.length * 90}%`,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const next = Math.min(SLIDES.length - 1, Math.floor(self.progress * SLIDES.length))
            goTo(next)
          },
        })

        return () => {
          trigger.kill()
          state.tl?.kill()
          state.scrambles.forEach((tween) => tween?.kill())
        }
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  const first = SLIDES[0]!

  return (
    <section
      className="whatis"
      ref={rootRef}
      id="features"
      data-companion="point-right"
      data-companion-x="-38"
      data-companion-y="21"
      data-companion-scale="0.38"
      data-companion-opacity="0.8"
      aria-label="What is nucky"
    >
      <div className="section-head landing-inner">
        <p className="section-label" data-reveal="blur-in">what is nucky?</p>
        <h2 className="section-title" data-motion-text>
          not a stat site. not a chatbot. an instrument.
        </h2>
      </div>

      {/* Desktop: pinned slide deck (hidden on mobile / reduced motion). */}
      <div className="whatis-slider" aria-hidden="true">
        <div className="whatis-bg">
          {SLIDES.map((slide) => (
            <div
              key={slide.key}
              className="whatis-bg-img"
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}
        </div>

        <div className="whatis-featured">
          {SLIDES.map((slide) => (
            <div className="whatis-frame" key={slide.key}>
              <img src={slide.image} alt="" loading="lazy" />
            </div>
          ))}
        </div>

        <header className="whatis-text">
          <div className="whatis-number">
            <span ref={numberRef}>{first.number}</span>
          </div>
          <div className="whatis-title-mask">
            <h3 className="whatis-title" ref={titleRef}>
              {first.title}
            </h3>
          </div>
          <div className="whatis-desc">
            <p ref={descRef}>{first.description}</p>
          </div>
        </header>

        <div className="whatis-para">
          <div className="whatis-para-line">
            <span ref={line1Ref}>{first.lines[0]}</span>
          </div>
          <div className="whatis-para-line">
            <span ref={line2Ref}>{first.lines[1]}</span>
          </div>
        </div>

        <div className="whatis-count" ref={countRef}>
          01 / 04
        </div>

        <div className="whatis-hint">scroll to advance</div>
      </div>

      {/* Mobile / reduced-motion: static stacked list (CSS-gated). */}
      <div className="whatis-list landing-inner">
        {SLIDES.map((slide) => (
          <article className="whatis-item" key={slide.key} data-reveal="fade-up">
            <div className="whatis-item-media">
              <img src={slide.image} alt="" loading="lazy" />
            </div>
            <div className="whatis-item-body">
              <span className="whatis-item-number">{slide.number}</span>
              <h3 className="whatis-item-title">{slide.title}</h3>
              <p className="whatis-item-desc">{slide.description}</p>
              <p className="whatis-item-copy">
                {slide.lines[0]} {slide.lines[1]}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
