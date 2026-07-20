import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { LeagueLogo } from '../entities'

gsap.registerPlugin(ScrollTrigger)

const STORY_PANELS = [
  {
    id: 'signal',
    kicker: 'signal in',
    title: ['read the', 'signal'],
    accent: 'not the noise',
    body: 'Twelve years of match context, role-adjusted power, and walk-forward predictions — one analytics spine.',
    chips: [
      { label: 'model grounded', tone: 'accent' },
      { label: 'tier-1 only', tone: 'muted' },
    ],
  },
  {
    id: 'leagues',
    kicker: 'coverage',
    title: ['every', 'stage'],
    accent: 'that matters',
    body: 'Domestic circuits and internationals share the same ratings, form, and matchup evidence.',
    chips: [
      { label: 'LCK → Worlds', tone: 'accent' },
      { label: 'live filters', tone: 'muted' },
    ],
  },
  {
    id: 'ask',
    kicker: 'analyst',
    title: ['ask once,', 'get evidence'],
    accent: '',
    body: 'The conversational layer retrieves LoL esports context and structured model packets — not improvised vibes.',
    chips: [
      { label: 'retrieval', tone: 'accent' },
      { label: 'auditable', tone: 'muted' },
    ],
  },
] as const

const LEAGUE_SHOWCASE = [
  { key: 'LCK', label: 'LCK', kind: 'domestic' },
  { key: 'LPL', label: 'LPL', kind: 'domestic' },
  { key: 'LEC', label: 'LEC', kind: 'domestic' },
  { key: 'LCS', label: 'LCS', kind: 'domestic' },
  { key: 'First Stand', label: 'First Stand', kind: 'intl' },
  { key: 'MSI', label: 'MSI', kind: 'intl' },
  { key: 'Worlds', label: 'Worlds', kind: 'intl' },
  { key: 'EWC', label: 'EWC', kind: 'intl' },
] as const

export default function StoryScroll() {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const section = sectionRef.current
      const track = trackRef.current
      if (!section || !track) return

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const mm = gsap.matchMedia()

      mm.add('(min-width: 900px)', () => {
        if (reduce) return

        const getScroll = () => Math.max(0, track.scrollWidth - window.innerWidth)

        const tween = gsap.to(track, {
          x: () => -getScroll(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            // Begin pin/scrub when the section is mid-viewport (not as soon as top hits top)
            start: 'center center',
            end: () => `+=${getScroll() + window.innerHeight * 0.5}`,
            pin: true,
            scrub: 0.85,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        gsap.utils.toArray<HTMLElement>('.landing-story-panel').forEach((panel) => {
          const labels = panel.querySelectorAll('.landing-story-chip')
          const copy = panel.querySelectorAll('.landing-story-copy > *')
          gsap.fromTo(
            copy,
            { opacity: 0.25, y: 28 },
            {
              opacity: 1,
              y: 0,
              ease: 'none',
              stagger: 0.08,
              scrollTrigger: {
                trigger: panel,
                containerAnimation: tween,
                start: 'left 75%',
                end: 'left 35%',
                scrub: true,
              },
            },
          )
          if (labels.length) {
            gsap.fromTo(
              labels,
              { opacity: 0, y: 16, rotate: -4 },
              {
                opacity: 1,
                y: 0,
                rotate: 0,
                ease: 'none',
                stagger: 0.06,
                scrollTrigger: {
                  trigger: panel,
                  containerAnimation: tween,
                  start: 'left 70%',
                  end: 'left 40%',
                  scrub: true,
                },
              },
            )
          }
        })

        gsap.fromTo(
          '.landing-league-card',
          { opacity: 0.35, y: 40, scale: 0.94 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            ease: 'none',
            stagger: 0.05,
            scrollTrigger: {
              trigger: '.landing-league-rail',
              containerAnimation: tween,
              start: 'left 80%',
              end: 'left 30%',
              scrub: true,
            },
          },
        )

        return () => {
          tween.scrollTrigger?.kill()
          tween.kill()
        }
      })

      mm.add('(max-width: 899px)', () => {
        if (reduce) return
        gsap.from('.landing-story-panel', {
          opacity: 0,
          y: 24,
          stagger: 0.08,
          duration: 0.55,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            once: true,
          },
        })
        gsap.from('.landing-league-card', {
          opacity: 0,
          y: 18,
          stagger: 0.05,
          duration: 0.45,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.landing-league-rail',
            start: 'top 85%',
            once: true,
          },
        })
      })

      return () => mm.revert()
    },
    { scope: sectionRef },
  )

  return (
    <section className="landing-story" ref={sectionRef} aria-label="Product story">
      <div className="landing-story-track" ref={trackRef}>
        {STORY_PANELS.map((panel, index) => (
          <article key={panel.id} className="landing-story-panel" data-panel={panel.id}>
            <div className="landing-story-copy">
              <p className="landing-story-kicker">
                <span className="signal-dot" aria-hidden="true" />
                {panel.kicker}
              </p>
              <h2 className="landing-story-title">
                {panel.title.map((line) => (
                  <span key={line} className="landing-story-title-line">
                    {line}
                  </span>
                ))}
                {panel.accent ? (
                  <span className="landing-story-title-line is-accent">{panel.accent}</span>
                ) : null}
              </h2>
              <p className="landing-story-body">{panel.body}</p>
            </div>
            <div className="landing-story-chips" aria-hidden="true">
              {panel.chips.map((chip, i) => (
                <span
                  key={chip.label}
                  className={`landing-story-chip tone-${chip.tone}`}
                  style={{ ['--chip-i' as string]: i + index }}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            {index === 1 ? (
              <div className="landing-league-rail" aria-label="League and tournament coverage">
                {LEAGUE_SHOWCASE.map((league) => (
                  <div key={league.key} className={`landing-league-card kind-${league.kind}`}>
                    <div className="landing-league-card-logo">
                      <LeagueLogo league={league.key} size={28} />
                    </div>
                    <div className="landing-league-card-meta">
                      <span className="landing-league-card-name">{league.label}</span>
                      <span className="landing-league-card-kind">
                        {league.kind === 'domestic' ? 'tier-1' : 'international'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
