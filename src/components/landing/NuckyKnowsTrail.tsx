import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import {
  championIconUrl,
  ddragonChampionKey,
  leagueLogoUrl,
  teamLogoUrlFromName,
} from '../../lib/entities'

function lerp(a: number, b: number, n: number) {
  return (1 - n) * a + n * b
}

/** Curated trail assets: teams, leagues, and champion icons (no fragile headshot CDN). */
function buildTrailUrls(): string[] {
  const teams = [
    'T1',
    'Gen.G',
    'Hanwha Life Esports',
    'G2 Esports',
    'Bilibili Gaming',
    'LYON',
    'KT Rolster',
    'FlyQuest',
    'Top Esports',
    'Fnatic',
  ]
  const leagues = ['LCK', 'LPL', 'LEC', 'LCS', 'MSI', 'Worlds', 'First Stand', 'EWC']
  const champs = ['Azir', 'Orianna', 'LeeSin', 'Ahri', 'Ezreal', 'Jinx', 'Vi', 'Ryze']

  const urls: string[] = []
  for (const t of teams) {
    const u = teamLogoUrlFromName(t)
    if (u) urls.push(u)
  }
  for (const l of leagues) {
    const u = leagueLogoUrl(l)
    if (u) urls.push(u)
  }
  for (const c of champs) {
    urls.push(championIconUrl(ddragonChampionKey(c)))
  }
  return urls
}

/**
 * Image mouse-trail section (React Bits Image Trail variant 1, brand-adapted).
 * Move pointer across the field to leave a trail of logos/icons.
 */
export default function NuckyKnowsTrail() {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const items = buildTrailUrls()

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const nodes = Array.from(stage.querySelectorAll<HTMLDivElement>('.landing-trail-img'))
    if (!nodes.length) return

    let imgPosition = 0
    let zIndexVal = 1
    let active = 0
    let idle = true
    const threshold = 72
    const mouse = { x: 0, y: 0 }
    const last = { x: 0, y: 0 }
    const cache = { x: 0, y: 0 }
    let raf = 0
    let running = false

    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = stage.getBoundingClientRect()
      if ('touches' in e && e.touches[0]) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      }
      const me = e as MouseEvent
      return { x: me.clientX - rect.left, y: me.clientY - rect.top }
    }

    const showNext = () => {
      zIndexVal += 1
      imgPosition = imgPosition < nodes.length - 1 ? imgPosition + 1 : 0
      const el = nodes[imgPosition]
      const w = el.offsetWidth || 120
      const h = el.offsetHeight || 120
      gsap.killTweensOf(el)
      gsap
        .timeline({
          onStart: () => {
            active += 1
            idle = false
          },
          onComplete: () => {
            active -= 1
            if (active === 0) idle = true
          },
        })
        .fromTo(
          el,
          {
            opacity: 1,
            scale: 1,
            zIndex: zIndexVal,
            x: cache.x - w / 2,
            y: cache.y - h / 2,
          },
          {
            duration: 0.35,
            ease: 'power1.out',
            x: mouse.x - w / 2,
            y: mouse.y - h / 2,
          },
          0,
        )
        .to(
          el,
          {
            duration: 0.45,
            ease: 'power3.in',
            opacity: 0,
            scale: 0.25,
          },
          0.35,
        )
    }

    const render = () => {
      const dx = mouse.x - last.x
      const dy = mouse.y - last.y
      const dist = Math.hypot(dx, dy)
      cache.x = lerp(cache.x, mouse.x, 0.12)
      cache.y = lerp(cache.y, mouse.y, 0.12)
      if (dist > threshold) {
        showNext()
        last.x = mouse.x
        last.y = mouse.y
      }
      if (idle && zIndexVal !== 1) zIndexVal = 1
      raf = requestAnimationFrame(render)
    }

    const onMove = (e: MouseEvent | TouchEvent) => {
      const p = pos(e)
      mouse.x = p.x
      mouse.y = p.y
      if (!running) {
        cache.x = p.x
        cache.y = p.y
        last.x = p.x
        last.y = p.y
        running = true
        raf = requestAnimationFrame(render)
      }
    }

    stage.addEventListener('mousemove', onMove, { passive: true })
    stage.addEventListener('touchmove', onMove, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('mousemove', onMove)
      stage.removeEventListener('touchmove', onMove)
      nodes.forEach((n) => gsap.killTweensOf(n))
    }
  }, [items.length])

  return (
    <section className="landing-knows" ref={rootRef} aria-label="nucky knows">
      <div className="landing-knows-copy">
        <p className="landing-section-label">signal memory</p>
        <h2 className="landing-knows-title">
          nucky <em>knows</em>
        </h2>
        <p className="landing-knows-lead">
          Move across the field — players, teams, leagues, and the champions that define the meta.
        </p>
      </div>
      <div className="landing-knows-stage" ref={stageRef}>
        {items.map((url, i) => (
          <div key={`${url}-${i}`} className="landing-trail-img" aria-hidden="true">
            <div className="landing-trail-img-inner" style={{ backgroundImage: `url(${url})` }} />
          </div>
        ))}
        <div className="landing-knows-hint" aria-hidden="true">
          drag the pointer
        </div>
      </div>
    </section>
  )
}
