import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { WeeklyRecapLine } from '../../lib/weeklyRecap'
import { scrollEntranceStagger } from '../../theme/animations'

interface WeeklyRecapProps {
  lines: WeeklyRecapLine[]
  windowLabel: string
}

export default function WeeklyRecap({ lines, windowLabel }: WeeklyRecapProps) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => scrollEntranceStagger(ref.current, '.overview-recap-item'), {
    scope: ref,
    dependencies: [lines.length],
  })

  return (
    <section ref={ref} className="card overview-hub-card">
      <h2 className="card-title">Weekly Recap</h2>
      <p className="card-subtitle">{windowLabel} · tier-1 takes from the data</p>
      {!lines.length ? (
        <p className="text-secondary">no match results in this window for the current filter.</p>
      ) : (
        <ul className="overview-recap-list">
          {lines.map((line) => (
            <li key={line.id} className="overview-recap-item">
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
