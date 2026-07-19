import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

/** Demo chips for marketing — not live rankings. */
const CLIMBERS = [
  { name: 'Chovy', meta: 'GEN · MID', delta: '+2.4', dir: 'up' as const },
  { name: 'Faker', meta: 'T1 · MID', delta: '+1.1', dir: 'up' as const },
  { name: 'T1', meta: 'LCK', delta: '+0.8', dir: 'up' as const },
  { name: 'Canyon', meta: 'GEN · JNG', delta: '+1.6', dir: 'up' as const },
  { name: 'Knight', meta: 'BLG · MID', delta: '+0.9', dir: 'up' as const },
  { name: 'Caps', meta: 'G2 · MID', delta: '+1.3', dir: 'up' as const },
  { name: 'Gen.G', meta: 'LCK', delta: '+1.0', dir: 'up' as const },
  { name: 'Ruler', meta: 'GEN · ADC', delta: '+0.7', dir: 'up' as const },
]

const FALLERS = [
  { name: 'ShowMaker', meta: 'DK · MID', delta: '−1.8', dir: 'down' as const },
  { name: 'G2', meta: 'LEC', delta: '−0.9', dir: 'down' as const },
  { name: 'Inspired', meta: 'FLY · JNG', delta: '−1.2', dir: 'down' as const },
  { name: 'BLG', meta: 'LPL', delta: '−0.6', dir: 'down' as const },
  { name: 'Zeka', meta: 'HLE · MID', delta: '−0.4', dir: 'down' as const },
  { name: '100T', meta: 'LCS', delta: '−1.5', dir: 'down' as const },
  { name: 'Peanut', meta: 'HLE · JNG', delta: '−0.8', dir: 'down' as const },
  { name: 'KC', meta: 'LEC', delta: '−1.1', dir: 'down' as const },
]

function Chip({
  name,
  meta,
  delta,
  dir,
}: {
  name: string
  meta: string
  delta: string
  dir: 'up' | 'down'
}) {
  return (
    <span className={`landing-ticker-chip dir-${dir}`}>
      <span className="landing-ticker-name">{name}</span>
      <span className="landing-ticker-meta">{meta}</span>
      <span className="landing-ticker-delta">
        {dir === 'up' ? '▲' : '▼'} {delta}
      </span>
    </span>
  )
}

type TickerItem = {
  name: string
  meta: string
  delta: string
  dir: 'up' | 'down'
}

function MarqueeRow({
  items,
  reverse,
  velocity,
}: {
  items: TickerItem[]
  reverse?: boolean
  velocity: number
}) {
  const rowRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const row = rowRef.current
      if (!row) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) return

      const track = row.querySelector<HTMLElement>('.landing-ticker-track')
      if (!track) return

      const distance = track.scrollWidth / 2
      const tween = gsap.fromTo(
        track,
        { x: reverse ? -distance : 0 },
        {
          x: reverse ? 0 : -distance,
          duration: distance / velocity,
          ease: 'none',
          repeat: -1,
        },
      )

      const pause = () => tween.pause()
      const play = () => tween.play()
      row.addEventListener('pointerenter', pause)
      row.addEventListener('pointerleave', play)

      return () => {
        row.removeEventListener('pointerenter', pause)
        row.removeEventListener('pointerleave', play)
        tween.kill()
      }
    },
    { scope: rowRef, dependencies: [velocity, reverse] },
  )

  const doubled = [...items, ...items]

  return (
    <div className="landing-ticker-row" ref={rowRef}>
      <div className="landing-ticker-track">
        {doubled.map((item, i) => (
          <Chip key={`${item.name}-${i}`} {...item} />
        ))}
      </div>
    </div>
  )
}

export default function RankTicker() {
  return (
    <section className="landing-ticker" aria-label="Example rank movement ticker">
      <div className="landing-ticker-head">
        <div>
          <p className="landing-ticker-label">&gt; ticker</p>
          <p className="landing-ticker-desc">
            Example power deltas — illustrative chips for the marketing surface, not live board data.
          </p>
        </div>
        <a className="landing-ticker-link" href="#model">
          model scorecard ↗
        </a>
      </div>
      <div className="landing-ticker-frame">
        <div className="landing-ticker-ruler" aria-hidden="true" />
        <div className="landing-ticker-rows">
          <MarqueeRow items={CLIMBERS} velocity={48} />
          <MarqueeRow items={FALLERS} reverse velocity={36} />
        </div>
        <div className="landing-ticker-ruler" aria-hidden="true" />
      </div>
    </section>
  )
}
