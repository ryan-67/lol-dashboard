import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { coarsePointer, MOTION, plateToAlpha, reducedMotion } from './motion'
import { leagueLogoUrl, teamLogoUrlFromName } from '../../lib/entities'
import { championIconUrl, ddragonChampionKey } from '../../lib/entities/assets'
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
  'JD Gaming',
  'Weibo Gaming',
  'LNG Esports',
  'Cloud9',
  'Team Liquid',
  '100 Thieves',
  'DRX',
  'Nongshim RedForce',
  'Team Vitality',
  'Movistar KOI',
]

const TOURNAMENTS = ['Worlds', 'MSI', 'First Stand', 'EWC', 'LCK', 'LPL', 'LEC', 'LCS']

const PLAYERS = Object.keys(LANDING_PLAYER_PORTRAITS)

const CHAMPIONS = [
  'Ahri',
  'Azir',
  'Lee Sin',
  'Yasuo',
  'Zed',
  'Sylas',
  'Aatrox',
  'Jinx',
  "Kai'Sa",
  'Orianna',
  'Renekton',
  'Gnar',
  'Viktor',
  'Ashe',
  "K'Sante",
  'Rumble',
]

/* Scattered field positions (percent of stage) — the center stays clear for
 * the headline. Depth pushes items into three planes for parallax. */
const SCATTER_POSITIONS = [
  /* top band */
  { top: 5, left: 4 },
  { top: 9, left: 13 },
  { top: 4, left: 22 },
  { top: 10, left: 31 },
  { top: 6, left: 40 },
  { top: 11, left: 49 },
  { top: 5, left: 58 },
  { top: 9, left: 67 },
  { top: 4, left: 76 },
  { top: 10, left: 85 },
  { top: 6, left: 94 },
  /* upper band */
  { top: 20, left: 7 },
  { top: 24, left: 18 },
  { top: 19, left: 30 },
  { top: 23, left: 44 },
  { top: 20, left: 58 },
  { top: 24, left: 71 },
  { top: 19, left: 84 },
  { top: 23, left: 95 },
  /* mid flanks — center stays clear for the headline */
  { top: 37, left: 4 },
  { top: 46, left: 10 },
  { top: 55, left: 4 },
  { top: 40, left: 96 },
  { top: 49, left: 90 },
  { top: 58, left: 96 },
  { top: 36, left: 18 },
  { top: 38, left: 82 },
  /* lower band */
  { top: 68, left: 6 },
  { top: 72, left: 17 },
  { top: 67, left: 29 },
  { top: 73, left: 43 },
  { top: 68, left: 57 },
  { top: 72, left: 70 },
  { top: 67, left: 82 },
  { top: 72, left: 93 },
  /* bottom band */
  { top: 84, left: 4 },
  { top: 90, left: 13 },
  { top: 85, left: 22 },
  { top: 91, left: 31 },
  { top: 86, left: 40 },
  { top: 90, left: 49 },
  { top: 85, left: 58 },
  { top: 91, left: 67 },
  { top: 86, left: 76 },
  { top: 90, left: 85 },
  { top: 85, left: 94 },
]

interface KnowsItem {
  url: string
  kind: 'team' | 'tournament' | 'player' | 'champion'
  pos: { top: number; left: number }
  depth: number
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

  const championItems = CHAMPIONS.map((name) => ({
    url: championIconUrl(ddragonChampionKey(name)),
    kind: 'champion' as const,
  }))

  const mixed = shuffle([...teamItems, ...tournamentItems, ...playerItems, ...championItems])
  const positions = shuffle(SCATTER_POSITIONS)

  return mixed.slice(0, positions.length).map((item, i) => ({
    ...item,
    pos: positions[i]!,
    /* Three depth planes: far 0.45, mid 0.72, near 1. */
    depth: [0.45, 0.72, 1][i % 3]!,
  }))
}

const TITLE_A = ['nucky', 'understands']
const TITLE_B = ['nucky', 'analyzes']
const TITLE_C = ['nucky', 'predicts']

/**
 * "nucky knows / nucky analyzes" — pinned scattered-field reveal, upgraded
 * into a depth field (animmaster_3d_20 language): items live on three
 * parallax planes, the whole field steers gently with the pointer, and the
 * settled field keeps breathing.
 */
export default function KnowsSection() {
  const rootRef = useRef<HTMLElement>(null)
  const items = useMemo(buildItems, [])
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({})

  /* Punch solid plates out of team/tournament logos — but skip light-on-dark
   * crests (Worlds/MSI white DarkBG, EWC black SVG) which plateToAlpha would
   * erase entirely. */
  useEffect(() => {
    let alive = true
    const blobUrls: string[] = []
    const isLightOnDark = (url: string) =>
      /WorldsDarkBG|MSIDarkBG|\/leagues\/ewc\.svg/i.test(url)

    const run = async () => {
      const next: Record<string, string> = {}
      await Promise.all(
        items.map(async (item) => {
          /* Players and champion art are full-bleed photos; light-on-dark
           * crests would be erased by the punch. Both keep raw assets. */
          if (item.kind === 'player' || item.kind === 'champion' || isLightOnDark(item.url)) {
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
      const wordsA = root.querySelectorAll('.knows-title--a .lw-word')
      const wordsB = root.querySelectorAll('.knows-title--b .lw-word')
      const wordsC = root.querySelectorAll('.knows-title--c .lw-word')
      const lead = root.querySelector('.knows-lead')

      const scatterX = (i: number) =>
        ((items[i]!.pos.left - 50) / 100) * stage.clientWidth * (0.72 + items[i]!.depth * 0.28)
      const scatterY = (i: number) =>
        ((items[i]!.pos.top - 50) / 100) * stage.clientHeight * (0.72 + items[i]!.depth * 0.28)

      if (reducedMotion()) {
        imgs.forEach((el, i) => {
          const item = items[i]
          if (!item) return
          gsap.set(el, {
            autoAlpha: 0.35 + item.depth * 0.65,
            scale: 0.35 + item.depth * 0.3,
            xPercent: -50,
            yPercent: -50,
            x: scatterX(i),
            y: scatterY(i),
          })
        })
        gsap.set([wordsA, lead], { autoAlpha: 1, yPercent: 0 })
        gsap.set([wordsB, wordsC], { autoAlpha: 0 })
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
        gsap.set(wordsA, { yPercent: 118 })
        gsap.set(wordsB, { yPercent: 118 })
        gsap.set(wordsC, { yPercent: 118 })
        gsap.set(lead, { autoAlpha: 0, y: 18 })

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: '+=280%',
            scrub: MOTION.scrub,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        /* Phase A — "nucky understands" rises. */
        tl.to(wordsA, {
          yPercent: 0,
          duration: 0.1,
          stagger: 0.03,
          ease: 'power3.out',
        })

        /* Phase B — entities bloom from the center stack. */
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

        /* Phase C — scatter into the depth field: far plane smaller,
         * dimmer, softly blurred; near plane crisp and large. */
        tl.to(
          imgs,
          {
            x: (i) => scatterX(i),
            y: (i) => scatterY(i),
            scale: (i) => 0.3 + items[i]!.depth * 0.34,
            autoAlpha: (i) => 0.4 + items[i]!.depth * 0.6,
            filter: (i) => `blur(${((1 - items[i]!.depth) * 2.4).toFixed(1)}px)`,
            duration: 0.26,
            stagger: 0.008,
            ease: 'power2.inOut',
          },
          0.34,
        )

        /* Phase D — headline cycle: understands → analyzes → predicts. */
        tl.to(wordsA, { yPercent: -118, duration: 0.07, stagger: 0.02, ease: 'power2.in' }, 0.56)
        tl.to(wordsB, { yPercent: 0, duration: 0.08, stagger: 0.03, ease: 'power3.out' }, 0.61)
        tl.to(lead, { autoAlpha: 1, y: 0, duration: 0.08, ease: 'power2.out' }, 0.64)
        tl.to(wordsB, { yPercent: -118, duration: 0.07, stagger: 0.02, ease: 'power2.in' }, 0.78)
        tl.to(wordsC, { yPercent: 0, duration: 0.08, stagger: 0.03, ease: 'power3.out' }, 0.83)

        /* Scroll drift — planes exit at depth-scaled speeds. */
        tl.to(
          imgs,
          {
            y: (i) => scatterY(i) - 18 - items[i]!.depth * 26,
            duration: 0.22,
            ease: 'none',
          },
          0.78,
        )

        /* Ambient life — every settled entity keeps floating and slowly
         * turning in 3D on its own phase (persistent, not entrance-only). */
        gsap.set(imgs.map((el) => el.querySelector('.knows-img-inner')), {
          transformPerspective: 700,
        })
        const floats = imgs.flatMap((el, i) => {
          const inner = el.querySelector('.knows-img-inner')
          if (!inner) return []
          return [
            gsap.to(inner, {
              y: gsap.utils.random(-10, -18),
              duration: gsap.utils.random(2.6, 4.4),
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
              delay: (i % 5) * 0.35,
            }),
            gsap.to(inner, {
              rotationY: gsap.utils.random(-14, 14),
              rotationX: gsap.utils.random(-8, 8),
              duration: gsap.utils.random(3.4, 5.6),
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
              delay: (i % 7) * 0.3,
            }),
          ]
        })

        /* Pointer steer — the field looks toward the cursor, near plane
         * moving furthest (fine pointers only). */
        const cleanupPointer: Array<() => void> = []
        if (!coarsePointer()) {
          const setters = imgs.map((el, i) => ({
            depth: items[i]!.depth,
            xTo: gsap.quickTo(el.querySelector('.knows-depth'), 'x', {
              duration: 0.9,
              ease: 'power3.out',
            }),
            yTo: gsap.quickTo(el.querySelector('.knows-depth'), 'y', {
              duration: 0.9,
              ease: 'power3.out',
            }),
          }))
          const rotTo = gsap.quickTo(stage, 'rotationY', { duration: 1.1, ease: 'power3.out' })
          const rotXTo = gsap.quickTo(stage, 'rotationX', { duration: 1.1, ease: 'power3.out' })
          gsap.set(stage, { transformPerspective: 1100 })

          const handleMove = (event: PointerEvent) => {
            const rect = stage.getBoundingClientRect()
            const nx = (event.clientX - rect.left) / rect.width - 0.5
            const ny = (event.clientY - rect.top) / rect.height - 0.5
            setters.forEach(({ depth, xTo, yTo }) => {
              xTo(nx * 46 * depth)
              yTo(ny * 30 * depth)
            })
            rotTo(nx * 2.4)
            rotXTo(-ny * 1.8)
          }
          const handleLeave = () => {
            setters.forEach(({ xTo, yTo }) => {
              xTo(0)
              yTo(0)
            })
            rotTo(0)
            rotXTo(0)
          }
          stage.addEventListener('pointermove', handleMove)
          stage.addEventListener('pointerleave', handleLeave)
          cleanupPointer.push(() => {
            stage.removeEventListener('pointermove', handleMove)
            stage.removeEventListener('pointerleave', handleLeave)
          })
        }

        return () => {
          floats.forEach((tween) => tween?.kill())
          cleanupPointer.forEach((fn) => fn())
        }
      })

      mm.add('(max-width: 768px)', () => {
        /* Mobile: no pin — headline reveal + staggered grid fade. */
        gsap.set(imgs, { clearProps: 'all' })
        gsap.set(wordsA, { yPercent: 118 })
        gsap.set([wordsB, wordsC], { yPercent: 0, autoAlpha: 0 })
        gsap.set(lead, { autoAlpha: 0, y: 14 })

        gsap.to(wordsA, {
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
      data-accent-hue="172"
      aria-label="nucky knows the players, teams, and tournaments"
    >
      <div className="knows-stage">
        {items.map((item, i) => {
          const src = resolvedUrls[item.url] ?? item.url
          const invert = /\/leagues\/ewc\.svg/i.test(item.url)
          return (
            <div key={`${item.url}-${i}`} className={`knows-img is-${item.kind}`} aria-hidden="true">
              <div className="knows-depth">
                <div className="knows-img-inner">
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={invert ? 'knows-logo-invert' : undefined}
                  />
                </div>
              </div>
            </div>
          )
        })}

        <div className="knows-heading">
          <h2 className="knows-title knows-title--a" aria-label="nucky understands">
            {TITLE_A.map((word) => (
              <span className="lw-mask" key={word} aria-hidden="true">
                <span className="lw-word">{word}</span>
              </span>
            ))}
          </h2>
          <h2 className="knows-title knows-title--b" aria-label="nucky analyzes">
            {TITLE_B.map((word) => (
              <span className="lw-mask" key={word} aria-hidden="true">
                <span className="lw-word">{word}</span>
              </span>
            ))}
          </h2>
          <h2 className="knows-title knows-title--c" aria-label="nucky predicts">
            {TITLE_C.map((word) => (
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
