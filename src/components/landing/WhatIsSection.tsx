import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { reducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const PILLARS = [
  {
    index: '01',
    key: 'dashboard',
    title: 'a statistics dashboard, free',
    body: 'Radars, form curves, role comparisons, matchup history, and patch-aware trends across every tier-1 league. No account needed to browse.',
    meta: ['players · teams · champions', 'tournaments · head-to-head', 'free forever'],
  },
  {
    index: '02',
    key: 'model',
    title: 'a prediction model with a public report card',
    body: 'Proprietary rating systems score thousands of pro matches — adjusting for role, opposition, form, and strength of schedule — then publish walk-forward accuracy, log-loss, and calibration for anyone to audit.',
    meta: ['walk-forward evaluation', 'must beat the naive baseline', 'refreshed every retrain'],
  },
  {
    index: '03',
    key: 'analyst',
    title: 'an analyst with twelve years of memory',
    body: 'A retrieval-augmented knowledge base spans twelve years of match records and indexed esports context. Ask about a matchup and nucky answers from evidence — not confident improvisation.',
    meta: ['retrieval-augmented', 'grounded in match statistics', 'says when evidence is thin'],
  },
  {
    index: '04',
    key: 'signal',
    title: 'one spine of evidence behind every surface',
    body: 'The dashboard, the model, and the analyst read from the same data. A trend you spot in a chart is the same signal the model weighs and the analyst explains.',
    meta: ['patterns beyond the box score', 'tempo · scaling · objective control', 'one shared signal'],
  },
]

/** "what is nucky" — sticky card stack; earlier cards recede as the next arrives. */
export default function WhatIsSection() {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || reducedMotion()) return

      const cards = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.whatis-card'))

      cards.forEach((card, index) => {
        const nextCard = cards[index + 1]
        if (!nextCard) return
        /* Dim with brightness (not opacity) so stacked cards never bleed
         * through each other's opaque backgrounds. */
        gsap.to(card, {
          scale: 0.93 + index * 0.012,
          filter: 'blur(2px) brightness(0.45)',
          y: -20,
          ease: 'none',
          scrollTrigger: {
            trigger: nextCard,
            start: 'top 82%',
            end: 'top 22%',
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
      })

      /* Inner content cascade per card. */
      cards.forEach((card) => {
        gsap.fromTo(
          card.querySelectorAll('.whatis-card-reveal'),
          { y: 30, autoAlpha: 0, filter: 'blur(6px)' },
          {
            y: 0,
            autoAlpha: 1,
            filter: 'blur(0px)',
            duration: 0.9,
            stagger: 0.09,
            ease: 'power4.out',
            clearProps: 'filter',
            scrollTrigger: { trigger: card, start: 'top 74%', once: true },
          },
        )
      })
    },
    { scope: rootRef },
  )

  return (
    <section
      className="whatis landing-inner"
      ref={rootRef}
      id="features"
      data-companion="point-right"
      data-companion-x="-84"
      data-companion-y="-4"
      data-companion-scale="0.5"
      aria-label="What is nucky"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">what is nucky?</p>
        <h2 className="section-title" data-motion-text>
          not a stat site. not a chatbot. an instrument.
        </h2>
      </div>

      <div className="whatis-stack">
        {PILLARS.map((pillar) => (
          <article className={`whatis-card is-${pillar.key}`} key={pillar.key}>
            <div className="whatis-card-index whatis-card-reveal">{pillar.index}</div>
            <div className="whatis-card-body">
              <h3 className="whatis-card-title whatis-card-reveal">{pillar.title}</h3>
              <p className="whatis-card-copy whatis-card-reveal">{pillar.body}</p>
              <ul className="whatis-card-meta whatis-card-reveal">
                {pillar.meta.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
