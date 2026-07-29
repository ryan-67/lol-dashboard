import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { MOTION, plateToAlpha, reducedMotion } from './motion'
import {
  leagueLogoUrl,
  teamLogoUrlFromName,
} from '../../lib/entities'
import { LANDING_PLAYER_PORTRAITS } from '../../data/landingPortraits'

gsap.registerPlugin(ScrollTrigger, useGSAP)

function withBase(path: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  return `${base}${path.replace(/^\//, '')}`
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

const TEAMS = [
  'T1',
  'Gen.G',
  'Hanwha Life Esports',
  'G2 Esports',
  'Bilibili Gaming',
  'Top Esports',
  'Fnatic',
  'FlyQuest',
  'KT Rolster',
  'Dplus Kia',
]

const TOURNAMENTS = ['Worlds', 'MSI', 'First Stand', 'EWC']

const PLAYERS = ['Faker', 'Chovy', 'Canyon', 'Caps', 'Knight', 'Bin', 'Viper', 'Zeus']

/* Scattered field positions (percent of stage) — the center stays clear for
 * the headline. Mirrors the "gallery of fame" reference layout. */
const SCATTER_POSITIONS = [
  { top: 8, left: 6 },
  { top: 6, left: 26 },
  { top: 10, left: 48 },
  { top: 7, left: 70 },
  { top: 12, left: 90 },
  { top: 30, left: 4 },
  { top: 28, left: 22 },
  { top: 32, left: 78 },
  { top: 27, left: 94 },
  { top: 52, left: 8 },
  { top: 55, left: 92 },
  { top: 70, left: 5 },
  { top: 74, left: 24 },
  { top: 68, left: 44 },
  { top: 76, left: 62 },
  { top: 71, left: 80 },
  { top: 88, left: 14 },
  { top: 90, left: 38 },
  { top: 86, left: 66 },
  { top: 90, left: 88 },
  { top: 48, left: 30 },
  { top: 50, left: 70 },
]

interface KnowsItem {
  url: string
  kind: 'team' | 'tournament' | 'player'
  pos: { top: number; left: number }
}

function buildItems(): KnowsItem[] {
  const teamItems = TEAMS.map((name) => ({
    url: teamLogoUrlFromName(name),
    kind: 'team' as const,
  })).filter((item): item is { url: string; kind: 'team' } => Boolean(item.url))

  const tournamentItems = TOURNAMENTS.map((name) => ({
    url: leagueLogoUrl(name),
    kind: 'tournament' as const,
  })).filter((item): item is { url: string; kind: 'tournament' } => Boolean(item.url))

  const playerItems = PLAYERS.map((name) => ({
    url: withBase(LANDING_PLAYER_PORTRAITS[name] ?? ''),
    kind: 'player' as const,
  })).filter((item) => Boolean(item.url))

  const mixed = shuffle([...teamItems, ...tournamentItems, ...playerItems])
  const positions = shuffle(SCATTER_POSITIONS)

  return mixed.slice(0, positions.length).map((item, i) => ({
    ...item,
    pos: positions[i]!,
  }))
}

const KNOWS_WORDS = ['nucky', 'knows']
const ANALYZES_WORDS = ['nucky', 'analyzes']

/**
 * "nucky knows / nucky analyzes" — pinned scattered-image reveal.
 * Images stack at center, scale up, then scatter to field positions while
 * the headline swaps. Adapted from the animmaster hero_21 reference.
 */
export default function KnowsSection() {
  const rootRef = useRef<HTMLElement>(null)
  const items = useMemo(buildItems, [])
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({})

  /* Punch solid white/black plates out of team + tournament logos so they
   * sit as true transparent assets on the matte page. Player portraits stay
   * as-is (photo cutouts aren't available). */
  useEffect(() => {
    let alive = true
    const blobUrls: string[] = []

    const run = async () => {
      const next: Record<string, string> = {}
      await Promise.all(
        items.map(async (item) => {
          if (item.kind === 'player') {
            next[item.url] = item.url
            return
          }
          try {
            const transparent = await plateToAlpha(item.url)
            if (transparent !== item.url) blobUrls.push(transparent)
            next[item.url] = transparent
          } catch {
            next[item.url] = item.url
          }
        }),
      )
      if (alive) setResolvedUrls(next)
    }

    void run()
    return () => {
      alive = false
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [items])

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const stage = root.querySelector<HTMLElement>('.knows-stage')
      if (!stage) return

      const imgs = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.knows-img'))
      const knowsWords = root.querySelectorAll('.knows-title--a .lw-word')
      const analyzesWords = root.querySelectorAll('.knows-title--b .lw-word')
      const lead = root.querySelector('.knows-lead')

      if (reducedMotion()) {
        imgs.forEach((el, i) => {
          const item = items[i]
          if (!item) return
          gsap.set(el, {
            autoAlpha: 1,
            scale: 1,
            xPercent: -50,
            yPercent: -50,
            x: () => ((item.pos.left - 50) / 100) * stage.clientWidth,
            y: () => ((item.pos.top - 50) / 100) * stage.clientHeight,
          })
        })
        gsap.set([knowsWords, lead], { autoAlpha: 1, yPercent: 0 })
        gsap.set(analyzesWords, { autoAlpha: 0 })
        return
      }

      const mm = gsap.matchMedia()

      mm.add('(min-width: 769px)', () => {
        gsap.set(imgs, {
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          scale: 0.3,
          autoAlpha: 0,
        })
        gsap.set(knowsWords, { yPercent: 118 })
        gsap.set(analyzesWords, { yPercent: 118 })
        gsap.set(lead, { autoAlpha: 0, y: 18 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: '+=240%',
            scrub: MOTION.scrub,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        /* Phase A — "nucky knows" rises. */
        tl.to(knowsWords, {
          yPercent: 0,
          duration: 0.1,
          stagger: 0.03,
          ease: 'power3.out',
        })

        /* Phase B — images bloom from the center stack. */
        tl.to(
          imgs,
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.16,
            stagger: 0.012,
            ease: 'power2.out',
          },
          0.08,
        )

        /* Phase C — scatter to field positions and settle smaller. */
        tl.to(
          imgs,
          {
            x: (i) => ((items[i]!.pos.left - 50) / 100) * stage.clientWidth,
            y: (i) => ((items[i]!.pos.top - 50) / 100) * stage.clientHeight,
            scale: 0.52,
            duration: 0.26,
            stagger: 0.008,
            ease: 'power2.inOut',
          },
          0.34,
        )

        /* Phase D — headline swap: knows → analyzes. */
        tl.to(
          knowsWords,
          { yPercent: -118, duration: 0.08, stagger: 0.02, ease: 'power2.in' },
          0.62,
        )
        tl.to(
          analyzesWords,
          { yPercent: 0, duration: 0.09, stagger: 0.03, ease: 'power3.out' },
          0.68,
        )
        tl.to(lead, { autoAlpha: 1, y: 0, duration: 0.09, ease: 'power2.out' }, 0.72)

        /* Ambient — the settled field drifts slightly for depth. */
        tl.to(
          imgs,
          {
            y: (i) => ((items[i]!.pos.top - 50) / 100) * stage.clientHeight - 24,
            duration: 0.24,
            ease: 'none',
          },
          0.76,
        )
      })

      mm.add('(max-width: 768px)', () => {
        /* Mobile: no pin — headline reveal + staggered grid fade. */
        gsap.set(imgs, { clearProps: 'all' })
        gsap.set(knowsWords, { yPercent: 118 })
        gsap.set(analyzesWords, { yPercent: 0, autoAlpha: 0 })
        gsap.set(lead, { autoAlpha: 0, y: 14 })

        gsap.to(knowsWords, {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.06,
          ease: MOTION.easeOut,
          scrollTrigger: { trigger: root, start: 'top 65%', once: true },
        })
        gsap.fromTo(
          imgs,
          { autoAlpha: 0, y: 26, scale: 0.92 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            stagger: 0.05,
            ease: MOTION.easeOut,
            scrollTrigger: { trigger: stage, start: 'top 65%', once: true },
          },
        )
        gsap.to(lead, {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease: MOTION.easeOut,
          scrollTrigger: { trigger: stage, start: 'top 60%', once: true },
        })
      })

      return () => mm.revert()
    },
    { scope: rootRef },
  )

  return (
    <section
      className="knows"
      ref={rootRef}
      id="knows"
      data-companion="point-up"
      data-companion-x="0"
      data-companion-y="34"
      data-companion-scale="0.4"
      data-companion-opacity="0.85"
      aria-label="nucky knows the players, teams, and tournaments"
    >
      <div className="knows-stage">
        {items.map((item, i) => {
          const src = resolvedUrls[item.url] ?? item.url
          return (
            <div key={`${item.url}-${i}`} className={`knows-img is-${item.kind}`} aria-hidden="true">
              <div className="knows-img-inner">
                <img src={src} alt="" loading="lazy" decoding="async" />
              </div>
            </div>
          )
        })}

        <div className="knows-heading">
          <h2 className="knows-title knows-title--a" aria-label="nucky knows">
            {KNOWS_WORDS.map((word) => (
              <span className="lw-mask" key={word} aria-hidden="true">
                <span className="lw-word">{word}</span>
              </span>
            ))}
          </h2>
          <h2 className="knows-title knows-title--b" aria-label="nucky analyzes">
            {ANALYZES_WORDS.map((word) => (
              <span className="lw-mask" key={word} aria-hidden="true">
                <span className="lw-word">{word}</span>
              </span>
            ))}
          </h2>
          <p className="knows-lead">
            every tier-1 player, team, champion, and tournament — twelve years deep
          </p>
        </div>
      </div>
    </section>
  )
}
