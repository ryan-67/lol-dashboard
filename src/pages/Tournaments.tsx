import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import { buildTournamentSummaries } from '../lib/tournamentAnalytics'
import { tournamentPath } from '../lib/tournamentCatalog'
import { formatGameDate, formatNum } from '../lib/format'
import { formatDurationMinSec } from '../lib/tournamentFormat'
import { scrollEntranceStagger } from '../theme/animations'
import { LeagueLogo } from '../components/entities'
import PageHeader, { PageHeaderReadout } from '../components/ui/PageHeader'

function formatDuration(minutes: number | null): string {
  return formatDurationMinSec(minutes)
}

export default function Tournaments() {
  const { data, league, split, year, loading, setSplit } = useDashboard()
  const ref = useRef<HTMLDivElement>(null)
  const defaultedSplit = useRef(false)

  // Tournaments overview should show the full competitive year by default.
  useEffect(() => {
    if (defaultedSplit.current) return
    defaultedSplit.current = true
    setSplit('ALL')
  }, [setSplit])

  const tournaments = useMemo(() => (data ? buildTournamentSummaries(data) : []), [data])

  useGSAP(
    () => {
      scrollEntranceStagger(ref.current, '.tournament-row')
    },
    { scope: ref, dependencies: [tournaments.length, league, split, year] },
  )

  if (loading && !data) {
    return <div className="card h-32 flex items-center justify-center text-secondary">Loading tournaments…</div>
  }

  return (
    <div className="page-section">
      <PageHeader
        eyebrow="tournaments"
        title="splits & internationals"
        subtitle="Tier-1 splits, playoffs, and international events — sorted by most recent game."
        meta={
          <>
            <PageHeaderReadout label="events" value={tournaments.length} />
            <PageHeaderReadout
              label="games"
              value={formatNum(
                tournaments.reduce((s, t) => s + t.gameCount, 0),
                0,
              )}
            />
          </>
        }
      />

      {tournaments.length === 0 ? (
        <div className="empty-state">No tournaments match the current filters.</div>
      ) : (
        <div ref={ref} className="card">
          <div className="table-wrap">
            <table className="data-table tournament-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Region</th>
                  <th>Games</th>
                  <th>Avg Duration</th>
                  <th>First Game</th>
                  <th>Last Game</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr key={t.id} className="tournament-row">
                    <td className="font-medium">
                      <Link to={tournamentPath(t.id)} className="entity-inline-link text-accent entity-inline-row">
                        {t.displayName}
                        <LeagueLogo league={t.league} size={16} />
                      </Link>
                    </td>
                    <td className="text-secondary">{t.region}</td>
                    <td className="text-secondary">{t.gameCount}</td>
                    <td className="text-secondary">{formatDuration(t.avgGameDurationMin)}</td>
                    <td className="text-secondary">{formatGameDate(t.firstGameDate)}</td>
                    <td className="text-secondary">{formatGameDate(t.lastGameDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-tertiary mt-3">
            {tournaments.length} tournaments · {formatNum(tournaments.reduce((s, t) => s + t.gameCount, 0), 0)} games
          </p>
        </div>
      )}
    </div>
  )
}
