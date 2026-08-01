import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import NuckyAiPaywall from '../../components/nuckyai/NuckyAiPaywall'
import AuthModal from '../../components/AuthModal'
import { EntityLink, TeamLogo, TeamStatTrends, ChampionEntityInline } from '../../components/entities'
import {
  PlayerMatchupGrid,
  TeamRadarComparison,
  HighestPriorityChamps,
} from '../../components/matchups'
import { useOptionalChatSession } from '../../context/ChatSessionContext'
import { useDashboard } from '../../context/DashboardContext'
import {
  fetchUpcomingCitoScheduleBoard,
  type CitoScheduleRow,
} from '../../lib/loadCitoSchedule'
import {
  buildPredictionBoard,
  buildDualPredictionOdds,
  formatBestOfLabel,
  formatModelOdds,
  resolveSeriesBestOf,
  tournamentDisplayName,
  type PrematchModelOdds,
} from '../../lib/predictions/scorePrematchClient'
import { buildTeamMatchHistoryWithPerf } from '../../lib/predictions/matchHistoryPerf'
import { fetchPlayerRatings, RATING_ROLES, type PlayerPowerRow } from '../../lib/loadPlayerRatings'
import {
  draftByMatchId,
  fetchLiveDraftsBundle,
  type LiveDraftRow,
} from '../../lib/loadLiveDrafts'
import { teamMatchesCanonical } from '../../lib/entities'
import { powerScoreTo100 } from '../../lib/scoreNormalize'
import { formatGameDate, formatNum, formatProfileDate } from '../../lib/format'
import { shellAwarePath } from '../../lib/shellPath'
import { isTier1Player, isTier1Team } from '../../lib/mergeSlices'

function pct(rate: number, digits = 0): string {
  return `${(rate * 100).toFixed(digits)}%`
}

function rosterForTeam(
  ratings: Awaited<ReturnType<typeof fetchPlayerRatings>>,
  teamName: string,
): { role: string; row: PlayerPowerRow }[] {
  if (!ratings) return []
  const out: { role: string; row: PlayerPowerRow }[] = []
  for (const role of RATING_ROLES) {
    const hit = ratings.roles[role]?.find((r) => teamMatchesCanonical(r.team, teamName))
    if (hit) out.push({ role, row: hit })
  }
  return out
}

function winConditionBlurb(
  teamName: string,
  model: PrematchModelOdds,
  isA: boolean,
): string {
  const p = isA ? model.winProbA : model.winProbB
  const power = isA ? model.powerA : model.powerB
  const roster = isA ? model.rosterPowerA : model.rosterPowerB
  const fav = p >= 0.55
  const parts = [
    fav
      ? `${teamName} is the model favorite (${pct(p)} series win).`
      : p <= 0.45
        ? `${teamName} is the underdog (${pct(p)} series win).`
        : `${teamName} sits near a coin-flip (${pct(p)}).`,
  ]
  if (power != null) parts.push(`Team power ${formatNum(power, 0)}/100.`)
  if (roster != null) parts.push(`Roster power ${formatNum(roster, 0)}/100.`)
  parts.push(
    fav
      ? 'Win condition: convert early advantages and close before the opponent’s spike windows.'
      : 'Win condition: force chaos, target the favorite’s weaker side of the map, and extend into preferred comps.',
  )
  return parts.join(' ')
}

export default function PredictionPreviewPage() {
  const { matchId = '' } = useParams()
  const location = useLocation()
  const chat = useOptionalChatSession()
  const isSubscribed = Boolean(chat?.isSubscribed)
  const {
    filteredPlayers,
    filteredTeams,
    filteredChampions,
    data,
    loading: dashLoading,
  } = useDashboard()
  const [scheduleRow, setScheduleRow] = useState<CitoScheduleRow | null>(null)
  const [model, setModel] = useState<PrematchModelOdds | null>(null)
  const [rosterA, setRosterA] = useState<{ role: string; row: PlayerPowerRow }[]>([])
  const [rosterB, setRosterB] = useState<{ role: string; row: PlayerPowerRow }[]>([])
  const [liveDraft, setLiveDraft] = useState<LiveDraftRow | null>(null)
  const [loading, setLoading] = useState(true)

  const teams = useMemo(
    () => [...filteredTeams].filter(isTier1Team),
    [filteredTeams],
  )
  const players = useMemo(
    () => filteredPlayers.filter(isTier1Player),
    [filteredPlayers],
  )

  useEffect(() => {
    if (!isSubscribed || !matchId) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    void (async () => {
      const board = await fetchUpcomingCitoScheduleBoard({ limit: 200 })
      const row = board.find((r) => r.match_id === matchId) ?? null
      if (!alive) return
      setScheduleRow(row)
      if (row) {
        const [built, ratings, drafts] = await Promise.all([
          buildPredictionBoard([row]),
          fetchPlayerRatings(),
          fetchLiveDraftsBundle(true),
        ])
        if (!alive) return
        setModel(built[0]?.model ?? null)
        setRosterA(rosterForTeam(ratings, row.team_a))
        setRosterB(rosterForTeam(ratings, row.team_b))
        setLiveDraft(draftByMatchId(drafts, matchId))
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [isSubscribed, matchId])

  const teamA = useMemo(
    () => teams.find((t) => scheduleRow && teamMatchesCanonical(t.name, scheduleRow.team_a)),
    [teams, scheduleRow],
  )
  const teamB = useMemo(
    () => teams.find((t) => scheduleRow && teamMatchesCanonical(t.name, scheduleRow.team_b)),
    [teams, scheduleRow],
  )

  const historyA = useMemo(() => {
    if (!scheduleRow) return []
    return buildTeamMatchHistoryWithPerf(
      players,
      scheduleRow.team_a,
      10,
      undefined,
      undefined,
      data?.gameCatalog,
    )
  }, [players, scheduleRow, data?.gameCatalog])

  const historyB = useMemo(() => {
    if (!scheduleRow) return []
    return buildTeamMatchHistoryWithPerf(
      players,
      scheduleRow.team_b,
      10,
      undefined,
      undefined,
      data?.gameCatalog,
    )
  }, [players, scheduleRow, data?.gameCatalog])

  const backTo = shellAwarePath('/predictions', location.pathname)

  if (!isSubscribed) {
    return (
      <div className="page-section predictions-preview-page">
        <PageHeader
          eyebrow="future · paid"
          title="series forecast"
          subtitle="Schedule listing is free on the Board. Win probabilities and post-draft packets require a subscription."
        />
        <NuckyAiPaywall
          onAction={() => {
            if (!chat?.user) chat?.setShowAuth(true)
            else void chat?.subscribe()
          }}
          actionLabel={
            !chat?.user
              ? 'sign in to subscribe'
              : chat?.checkoutLoading
                ? 'loading…'
                : 'subscribe for future odds'
          }
          actionDisabled={Boolean(chat?.checkoutLoading)}
          footnote="Current power rankings stay free on Players / Teams / Overview."
        />
        <AuthModal
          open={Boolean(chat?.showAuth)}
          onClose={() => chat?.setShowAuth(false)}
        />
      </div>
    )
  }

  if (loading || dashLoading) {
    return (
      <div className="page-section">
        <p className="text-secondary text-sm">loading preview…</p>
      </div>
    )
  }

  if (!scheduleRow || !model) {
    return (
      <div className="page-section">
        <PageHeader
          eyebrow="preview"
          title="series not found"
          subtitle="This match may have started or left the schedule."
        />
        <Link to={backTo} className="btn btn-secondary">
          back to predictions
        </Link>
      </div>
    )
  }

  const bestOf = resolveSeriesBestOf(scheduleRow)
  const sideBiasA =
    liveDraft?.draftComplete && liveDraft.blueTeam
      ? teamMatchesCanonical(liveDraft.blueTeam, scheduleRow.team_a)
        ? 1
        : teamMatchesCanonical(liveDraft.redTeam ?? '', scheduleRow.team_a)
          ? -1
          : 0
      : 0
  const dual = buildDualPredictionOdds(model, {
    bestOf,
    draftComplete: Boolean(liveDraft?.draftComplete),
    sideBiasA,
  })
  const display = dual.game ?? dual.series
  const favIsA = display.winProbA >= display.winProbB

  return (
    <div className="page-section predictions-preview-page">
      <p className="predictions-back">
        <Link to={backTo} className="entity-link">
          ← predictions
        </Link>
      </p>

      <section className="predictions-hero card">
        <p className="predictions-hero-eyebrow">
          {dual.mode === 'post-draft-game'
            ? `post-draft game ${liveDraft?.gameNumber ?? ''} prediction`
            : 'pre-draft series prediction'}
        </p>
        <div className="predictions-hero-matchup">
          <span className="predictions-hero-team">
            <TeamLogo name={scheduleRow.team_a} size={36} />
            <EntityLink type="team" name={scheduleRow.team_a} showIcon={false} />
          </span>
          <span className="predictions-hero-vs text-secondary">vs</span>
          <span className="predictions-hero-team">
            <TeamLogo name={scheduleRow.team_b} size={36} />
            <EntityLink type="team" name={scheduleRow.team_b} showIcon={false} />
          </span>
        </div>
        <p className="predictions-hero-meta text-secondary">
          {tournamentDisplayName(scheduleRow)} · {formatBestOfLabel(bestOf)} ·{' '}
          {scheduleRow.scheduled_at ? formatProfileDate(scheduleRow.scheduled_at) : 'TBD'}
        </p>
        <div className="predictions-hero-odds">
          <div className={`predictions-hero-side${favIsA ? ' is-fav' : ''}`}>
            <span className="predictions-hero-pct text-accent">{pct(display.winProbA)}</span>
            <span className="text-secondary text-sm">{scheduleRow.team_a}</span>
          </div>
          <div className="predictions-hero-bar" aria-hidden>
            <div
              className="predictions-hero-bar-fill"
              style={{ width: `${Math.round(display.winProbA * 100)}%` }}
            />
          </div>
          <div className={`predictions-hero-side${!favIsA ? ' is-fav' : ''}`}>
            <span className="predictions-hero-pct text-accent">{pct(display.winProbB)}</span>
            <span className="text-secondary text-sm">{scheduleRow.team_b}</span>
          </div>
        </div>
        <p className="text-secondary text-sm">
          pre-draft series {formatModelOdds(dual.series)}
          {dual.game
            ? ` · post-draft game ${formatModelOdds(dual.game)}${
                liveDraft?.gameNumber != null ? ` (g${liveDraft.gameNumber})` : ''
              }`
            : ' · waiting for locked draft for game odds'}
          {' · '}confidence {display.confidence} · source {display.source}
        </p>
      </section>

      {liveDraft?.draftComplete ? (
        <section className="card" aria-label="Post-draft comps">
          <p className="page-header-eyebrow">post-draft</p>
          <h3 className="card-title">
            Locked draft
            {liveDraft.gameNumber != null ? ` · game ${liveDraft.gameNumber}` : ''}
          </h3>
          <p className="card-subtitle">
            Game win% above uses series Elo inverted to map odds + side. Ask nucky in chat for the
            full draft-aware packet (champion matchup blend).
          </p>
          <div className="overview-grid overview-grid-2">
            <div>
              <p className="text-sm text-secondary" style={{ marginBottom: '0.5rem' }}>
                Blue · {liveDraft.blueTeam ?? 'TBD'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {liveDraft.bluePicks.map((p) => (
                  <li key={`b-${p.championName}`} style={{ padding: '0.25rem 0' }}>
                    <ChampionEntityInline name={p.championName} iconSize={20} />
                    {p.role ? (
                      <span className="text-tertiary text-xs"> · {p.role}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-secondary" style={{ marginBottom: '0.5rem' }}>
                Red · {liveDraft.redTeam ?? 'TBD'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {liveDraft.redPicks.map((p) => (
                  <li key={`r-${p.championName}`} style={{ padding: '0.25rem 0' }}>
                    <ChampionEntityInline name={p.championName} iconSize={20} />
                    {p.role ? (
                      <span className="text-tertiary text-xs"> · {p.role}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <div className="predictions-power-grid">
        <div className="card">
          <h3 className="card-title">team power</h3>
          <table className="entity-table entity-table-compact">
            <tbody>
              <tr>
                <td>
                  <EntityLink type="team" name={scheduleRow.team_a} />
                </td>
                <td className="text-accent font-mono">
                  {model.powerA != null ? formatNum(model.powerA, 0) : '—'}
                </td>
                <td className="text-secondary">
                  elo {model.eloA != null ? Math.round(model.eloA) : '—'}
                </td>
              </tr>
              <tr>
                <td>
                  <EntityLink type="team" name={scheduleRow.team_b} />
                </td>
                <td className="text-accent font-mono">
                  {model.powerB != null ? formatNum(model.powerB, 0) : '—'}
                </td>
                <td className="text-secondary">
                  elo {model.eloB != null ? Math.round(model.eloB) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 className="card-title">player power</h3>
          <div className="predictions-roster-cols">
            <RosterPowerList title={scheduleRow.team_a} rows={rosterA} />
            <RosterPowerList title={scheduleRow.team_b} rows={rosterB} />
          </div>
        </div>
      </div>

      <section className="card">
        <h3 className="card-title">win conditions</h3>
        <p className="text-sm">{winConditionBlurb(scheduleRow.team_a, model, true)}</p>
        <p className="text-sm mt-2">{winConditionBlurb(scheduleRow.team_b, model, false)}</p>
      </section>

      {teamA && teamB ? (
        <div className="matchups-stack">
          <TeamRadarComparison teamA={teamA} teamB={teamB} cohort={teams} />
          <PlayerMatchupGrid players={players} teamA={teamA.name} teamB={teamB.name} />
          <HighestPriorityChamps
            teamChampions={data?.teamChampions ?? []}
            teams={filteredTeams}
            champions={filteredChampions}
            teamAName={teamA.name}
            teamBName={teamB.name}
          />
        </div>
      ) : (
        <p className="text-secondary text-sm">
          Direct matchup charts unavailable — one or both teams missing from the current dashboard
          slice.
        </p>
      )}

      <div className="predictions-trends-grid">
        <div>
          <h3 className="card-title">{scheduleRow.team_a} trends</h3>
          <TeamStatTrends players={players} teamSlugOrName={scheduleRow.team_a} />
        </div>
        <div>
          <h3 className="card-title">{scheduleRow.team_b} trends</h3>
          <TeamStatTrends players={players} teamSlugOrName={scheduleRow.team_b} />
        </div>
      </div>

      <RecentHistoryTable title={`${scheduleRow.team_a} — last 10`} rows={historyA} />
      <RecentHistoryTable title={`${scheduleRow.team_b} — last 10`} rows={historyB} />
    </div>
  )
}

function RosterPowerList({
  title,
  rows,
}: {
  title: string
  rows: { role: string; row: PlayerPowerRow }[]
}) {
  if (!rows.length) {
    return (
      <div>
        <p className="text-secondary text-sm">{title}</p>
        <p className="text-secondary text-sm">no rated roster</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-secondary text-sm mb-1">{title}</p>
      <ul className="predictions-roster-list">
        {rows.map(({ role, row }) => (
          <li key={`${role}-${row.player}`}>
            <span className="text-secondary">{role}</span>{' '}
            <EntityLink type="player" name={row.player} showIcon={false} />{' '}
            <span className="text-accent font-mono">
              {formatNum(powerScoreTo100(row.powerScore), 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecentHistoryTable({
  title,
  rows,
}: {
  title: string
  rows: ReturnType<typeof buildTeamMatchHistoryWithPerf>
}) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {!rows.length ? (
        <p className="text-secondary text-sm">no recent games in current slice</p>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table entity-table-compact">
            <thead>
              <tr>
                <th>Result</th>
                <th>Matchup</th>
                <th>Side</th>
                <th>Patch</th>
                <th>Tournament</th>
                <th>Date</th>
                <th>Perf</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={`${m.date}-${m.gameId || i}`}>
                  <td className={m.result === 'W' ? 'text-accent' : 'text-secondary'}>
                    {m.result}
                  </td>
                  <td>
                    <EntityLink type="team" name={m.teamName} showIcon={false} /> vs{' '}
                    {m.opponent ? (
                      <EntityLink type="team" name={m.opponent} showIcon={false} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={m.sideClass}>{m.side}</td>
                  <td>{m.patch}</td>
                  <td className="text-secondary">{m.tournament}</td>
                  <td>{formatGameDate(m.date)}</td>
                  <td className="text-accent font-mono">
                    {m.performanceScore != null ? formatNum(m.performanceScore, 0) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
