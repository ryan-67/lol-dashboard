import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import type { WeeklyRecapLine } from '../../lib/weeklyRecap'
import { scrollEntranceStagger } from '../../theme/animations'
import TeamLogo from '../entities/TeamLogo'

interface WeeklyRecapProps {
  lines: WeeklyRecapLine[]
  windowLabel: string
}

function RecapLineBody({ line }: { line: WeeklyRecapLine }) {
  return (
    <>
      {line.segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={`${line.id}-t-${i}`}>{seg.value}</span>
        }
        return (
          <span key={`${line.id}-team-${i}`} className="overview-recap-team">
            <TeamLogo name={seg.canonicalName} size={16} />
            <span>{seg.label}</span>
          </span>
        )
      })}
    </>
  )
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
      <p className="card-subtitle">{windowLabel} · tier-1 takes · cached when available</p>
      {!lines.length ? (
        <p className="text-secondary">no match results in this window for the current filter.</p>
      ) : (
        <ul className="overview-recap-list">
          {lines.map((line) => (
            <li key={line.id} className="overview-recap-item">
              <time className="overview-recap-date" dateTime={line.date}>
                {line.dateLabel}
              </time>
              <div className="overview-recap-body">
                <RecapLineBody line={line} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
