import { useMemo, useRef, useState, useEffect } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import { type Player, type PlayerGameLog } from '../hooks/useDashboardData'
import {
  ROLES,
  type RoleKey,
} from '../lib/championAnalytics'
import {
  buildWeeklyChampionStatsFromPlayers,
  computeChampionOfWeekScores,
} from '../lib/championOfWeekScore'
import {
  PLAYERS_ROLE_COLORS,
  ROLE_METRICS,
  buildRadarSeries,
  computeGameScore,
  getMetricValue,
  normalizePosition,
  playersForRole,
} from '../lib/playerRadar'
import { aggregateAdvancedFromGameLog } from '../lib/advancedStats'
import { findTeamByName } from '../lib/teamAnalytics'
import TeamRadarChart from '../components/teams/TeamRadarChart'
import { EntityLink, ChampionEntityInline } from '../components/entities'
import WeeklyRecap from '../components/overview/WeeklyRecap'
import { buildWeeklyRecapLines } from '../lib/weeklyRecap'
import { fetchCachedWeeklyRecapLines } from '../lib/loadWeeklyRecap'
import { getWeeklyWindow, inWeeklyWindow, type WeeklyWindow } from '../lib/weeklyWindow'
import { CHART } from '../theme/chartTheme'
import {
  scrollEntranceStagger,
  refreshScrollTrigger,
} from '../theme/animations'
import { formatGameDate, formatNum, formatPct, formatRefreshTimestamp } from '../lib/format'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { makeChartTooltipContent } from '../components/ui/ChartTooltip'
import ShareableChart from '../components/ui/ShareableChart'
import { MetricScoreRow } from '../components/ui/MetricHint'
import {
  OP_SCORE_HINT,
  PERFORMANCE_SCORE_HINT,
  TEAM_SCORE_HINT,
} from '../lib/metricHints'

interface WeeklyPlayer {
  base: Player
  role: RoleKey
  weekly: Player
  weeklyGames: PlayerGameLog[]
  scoreAvg: number
}

interface OpponentLane {
  team: string
  player: string
  champion: string
}

interface TeamWeekStats {
  team: string
  weeklyWins: number
  weeklyGames: number
  weeklyWinrate: number
  weeklyAvgKda: number
  weeklyAvgGd15: number
  weeklyObjControl: number
  avgOpponentSplitWinrate: number
  upsetWins: number
  impressiveness: number
}

const METRIC_LABELS: Partial<Record<keyof Player, string>> = {
  csd15: 'CS@15',
  gd15: 'GD@15',
  xpd15: 'XP@15',
  dpm: 'DPM',
  kda: 'KDA',
  dmgShare: 'DMG%',
  firstBloodRate: 'FB%',
  kp: 'KP',
  objControl: 'OBJ CTRL',
  goldShare: 'GOLD%',
  visionScore: 'VISION',
  turretPlates: 'Plates',
  dmgGoldRatio: 'DMG/GOLD',
  dmgPerGold: 'DMG/G',
  kaPerMin: 'K+A/m',
  campsStolen: 'Camps',
  wardsDestroyed: 'Wards Clr',
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function createWeeklyPlayerSnapshot(base: Player, logs: PlayerGameLog[]): Player {
  const advanced = aggregateAdvancedFromGameLog(logs)
  return {
    ...base,
    games: logs.length,
    kda: avg(logs.map((g) => g.kda)),
    kp: avg(logs.map((g) => g.kp)),
    dmgShare: avg(logs.map((g) => g.dmgShare)),
    gd15: avg(logs.map((g) => g.gd15)),
    csd15: avg(logs.map((g) => g.csd15)),
    xpd15: avg(logs.map((g) => g.xpd15)),
    dpm: avg(logs.map((g) => g.dpm)),
    visionScore: avg(logs.map((g) => g.visionScore ?? 0)),
    goldShare: avg(logs.map((g) => g.goldShare ?? 0)),
    firstBloodRate: avg(logs.map((g) => g.firstBloodRate ?? 0)),
    objControl: avg(logs.map((g) => g.objControl ?? 0)),
    turretPlates: advanced.turretPlates,
    campsStolen: advanced.campsStolen,
    wardsDestroyed: advanced.wardsDestroyed,
    kaPerMin: advanced.kaPerMin,
    dmgGoldRatio: advanced.dmgGoldRatio,
    dmgPerGold: advanced.dmgPerGold,
    gameLog: logs,
  }
}

function getWeeklyPlayers(
  players: Player[],
  window: WeeklyWindow,
): WeeklyPlayer[] {
  const groupedByRole = new Map<RoleKey, WeeklyPlayer[]>()
  for (const role of ROLES) groupedByRole.set(role, [])

  for (const player of players) {
    const role = normalizePosition(player.position)
    if (!role) continue
    const logs = (player.gameLog ?? []).filter((g) => inWeeklyWindow(g, window))
    if (!logs.length) continue
    const weekly = createWeeklyPlayerSnapshot(player, logs)
    const cohort = playersForRole(players, role)
    const scoreAvg = avg(
      logs.map((g) => computeGameScore(g, role, cohort)) as number[],
    )
    groupedByRole.get(role)?.push({
      base: player,
      role,
      weekly,
      weeklyGames: logs,
      scoreAvg,
    })
  }

  const out: WeeklyPlayer[] = []
  for (const role of ROLES) {
    const row = groupedByRole.get(role) ?? []
    out.push(...row)
  }
  return out
}

function gameLogKey(team: string, log: PlayerGameLog): string {
  return log.gameId ?? `${log.date}|${team}|${log.champion}|${log.result}|${log.opponent ?? ''}|${log.kda}`
}

function isSameGame(
  teamA: string,
  logA: PlayerGameLog,
  teamB: string,
  logB: PlayerGameLog,
): boolean {
  if (logA.gameId && logB.gameId) return logA.gameId === logB.gameId
  return gameLogKey(teamA, logA) === gameLogKey(teamB, logB)
}

function opponentLaneInfo(
  allPlayers: Player[],
  playerTeam: string,
  role: RoleKey,
  log: PlayerGameLog,
): OpponentLane {
  let team = log.opponent?.trim() ?? ''

  if (!team) {
    const sameDatePeers = allPlayers.filter((p) => {
      if (p.team === playerTeam) return false
      if (normalizePosition(p.position) !== role) return false
      return (p.gameLog ?? []).some((g) => g.date === log.date)
    })

    for (const peer of sameDatePeers) {
      const peerGame = (peer.gameLog ?? []).find((g) =>
        isSameGame(playerTeam, log, peer.team, g),
      )
      if (peerGame && peerGame.result !== log.result) {
        return {
          team: peer.team,
          player: peer.name,
          champion: peerGame.champion || 'N/A',
        }
      }
    }

    const fallback = sameDatePeers[0]
    if (fallback) {
      const peerGame = (fallback.gameLog ?? []).find((g) =>
        isSameGame(playerTeam, log, fallback.team, g),
      )
      return {
        team: fallback.team,
        player: fallback.name,
        champion: peerGame?.champion || 'N/A',
      }
    }

    return { team: 'N/A', player: 'N/A', champion: 'N/A' }
  }

  const candidates = allPlayers.filter(
    (p) => p.team === team && normalizePosition(p.position) === role,
  )
  for (const candidate of candidates) {
    const hit = (candidate.gameLog ?? []).find((g) => isSameGame(playerTeam, log, team, g))
    if (hit) {
      return { team, player: candidate.name, champion: hit.champion || 'N/A' }
    }
  }
  return { team, player: 'N/A', champion: 'N/A' }
}

function highestDeltaStat(
  player: WeeklyPlayer,
  roleCohort: Player[],
): { stat: string; value: number; delta: number } {
  const defs = ROLE_METRICS[player.role]
  let best = { stat: 'KDA', value: player.weekly.kda, delta: 0 }
  for (const def of defs) {
    const cohortAvg =
      avg(roleCohort.map((c) => Number(getMetricValue(c, def.key) ?? 0))) || 0
    const val = Number(getMetricValue(player.weekly, def.key) ?? 0)
    const delta = val - cohortAvg
    if (delta > best.delta) {
      best = {
        stat: METRIC_LABELS[def.key] ?? def.label,
        value: val,
        delta,
      }
    }
  }
  return best
}

function minMaxNorm(value: number, all: number[]): number {
  const min = Math.min(...all)
  const max = Math.max(...all)
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

function calculateHottestTeams(
  weeklyPlayers: WeeklyPlayer[],
  splitTeams: { name: string; winrate: number }[],
): TeamWeekStats[] {
  const splitWinrate = new Map(splitTeams.map((t) => [t.name, t.winrate]))
  const teamMap = new Map<string, TeamWeekStats>()

  for (const wp of weeklyPlayers) {
    const t = wp.base.team
    const entry = teamMap.get(t) ?? {
      team: t,
      weeklyWins: 0,
      weeklyGames: 0,
      weeklyWinrate: 0,
      weeklyAvgKda: 0,
      weeklyAvgGd15: 0,
      weeklyObjControl: 0,
      avgOpponentSplitWinrate: 0,
      upsetWins: 0,
      impressiveness: 0,
    }

    const unique = new Map<string, PlayerGameLog>()
    for (const g of wp.weeklyGames) {
      const key = `${g.date}|${g.opponent}|${g.result}`
      if (!unique.has(key)) unique.set(key, g)
    }
    const matches = [...unique.values()]

    const wins = matches.filter((m) => m.result === 1).length
    entry.weeklyWins += wins
    entry.weeklyGames += matches.length
    entry.weeklyAvgKda += avg(matches.map((m) => m.kda))
    entry.weeklyAvgGd15 += avg(matches.map((m) => m.gd15))
    entry.weeklyObjControl += avg(matches.map((m) => m.objControl ?? 0))

    const teamSplit = splitWinrate.get(t) ?? 50
    const oppWrs: number[] = []
    for (const m of matches) {
      const opp = m.opponent ?? ''
      const wr = splitWinrate.get(opp) ?? 50
      oppWrs.push(wr)
      if (m.result === 1 && wr > teamSplit) entry.upsetWins += 1
    }
    entry.avgOpponentSplitWinrate += avg(oppWrs)
    teamMap.set(t, entry)
  }

  const rows = [...teamMap.values()]
    .filter((t) => t.weeklyGames > 0)
    .map((t) => {
      const div = 5
      return {
        ...t,
        weeklyWinrate: (t.weeklyWins / Math.max(t.weeklyGames, 1)) * 100,
        weeklyAvgKda: t.weeklyAvgKda / div,
        weeklyAvgGd15: t.weeklyAvgGd15 / div,
        weeklyObjControl: t.weeklyObjControl / div,
        avgOpponentSplitWinrate: t.avgOpponentSplitWinrate / div,
      }
    })

  if (!rows.length) return []

  const wrs = rows.map((r) => r.weeklyWinrate)
  const kdas = rows.map((r) => r.weeklyAvgKda)
  const gds = rows.map((r) => r.weeklyAvgGd15)
  const objs = rows.map((r) => r.weeklyObjControl)
  const sos = rows.map((r) => r.avgOpponentSplitWinrate)

  return rows
    .map((r) => {
      const score =
        minMaxNorm(r.weeklyWinrate, wrs) * 0.42 +
        minMaxNorm(r.weeklyAvgGd15, gds) * 0.18 +
        minMaxNorm(r.weeklyAvgKda, kdas) * 0.14 +
        minMaxNorm(r.weeklyObjControl, objs) * 0.12 +
        minMaxNorm(r.avgOpponentSplitWinrate, sos) * 0.1 +
        r.upsetWins * 1.5
      return { ...r, impressiveness: score }
    })
    .sort((a, b) => b.impressiveness - a.impressiveness)
}

function WeeklyRadar({
  player,
  role,
  cohort,
  compact = false,
}: {
  player: Player
  role: RoleKey
  cohort: Player[]
  compact?: boolean
}) {
  const data = buildRadarSeries(player, role, cohort)
  const color = PLAYERS_ROLE_COLORS[role]
  const tooltipContent = makeChartTooltipContent(
    () => player.name,
    (props) => {
      const point = props.payload?.[0]?.payload as {
        label?: string
        formattedPlayer?: string
        formattedAvg?: string
      }
      if (!point?.label) return []
      return [
        { label: point.label, value: point.formattedPlayer ?? '—' },
        { label: 'Role avg', value: point.formattedAvg ?? '—' },
      ]
    },
  )
  return (
    <ShareableChart className="overview-weekly-radar">
      <ResponsiveContainer width="100%" height={compact ? 200 : 270}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius={compact ? '68%' : '72%'}>
          <PolarGrid stroke={CHART.grid} />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: CHART.tick, fontSize: 10, fontFamily: CHART.fontFamily }}
          />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip content={tooltipContent} />
          <Radar
            name="Role average"
            dataKey="avgNorm"
            stroke="rgba(240, 236, 226, 0.35)"
            fill="transparent"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <Radar
            name={player.name}
            dataKey="playerNorm"
            stroke={color}
            fill={color}
            fillOpacity={0.12}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ShareableChart>
  )
}

export default function Overview() {
  const {
    filteredPlayers,
    filteredTeams,
    filteredChampions,
    loading,
    league,
    split,
    year,
    lastUpdated,
    selectedLeagues,
  } = useDashboard()
  const rootRef = useRef<HTMLDivElement>(null)

  const weeklyWindow = useMemo(
    () => getWeeklyWindow(filteredPlayers, year, split),
    [filteredPlayers, year, split],
  )
  const weeklyPlayers = useMemo(
    () => (weeklyWindow ? getWeeklyPlayers(filteredPlayers, weeklyWindow) : []),
    [filteredPlayers, weeklyWindow],
  )

  const playerOfWeek = useMemo(() => {
    if (!weeklyPlayers.length) return null
    return [...weeklyPlayers].sort((a, b) => b.scoreAvg - a.scoreAvg)[0] ?? null
  }, [weeklyPlayers])

  const teamOfWeek = useMemo(() => {
    return ROLES.map((role) => {
      const best = [...weeklyPlayers]
        .filter((p) => p.role === role)
        .sort((a, b) => b.scoreAvg - a.scoreAvg)[0]
      return best ?? null
    }).filter((p): p is WeeklyPlayer => p !== null)
  }, [weeklyPlayers])

  const hottestTeams = useMemo(
    () => calculateHottestTeams(weeklyPlayers, filteredTeams.map((t) => ({ name: t.name, winrate: t.winrate }))),
    [weeklyPlayers, filteredTeams],
  )
  const hottestTeam = hottestTeams[0] ?? null
  const hottestTeamEntity = useMemo(
    () => (hottestTeam ? findTeamByName(filteredTeams, hottestTeam.team) : null),
    [hottestTeam, filteredTeams],
  )

  const championOpResult = useMemo(() => {
    if (!weeklyWindow) return { top: null, runners: [] }
    const stats = buildWeeklyChampionStatsFromPlayers(
      weeklyPlayers,
      filteredChampions,
      { start: weeklyWindow.key, end: weeklyWindow.end.toISOString().slice(0, 10) },
    )
    return computeChampionOfWeekScores(stats)
  }, [weeklyPlayers, filteredChampions, weeklyWindow])

  const templateRecapLines = useMemo(
    () =>
      weeklyWindow
        ? buildWeeklyRecapLines(filteredPlayers, filteredTeams, weeklyWindow, league)
        : [],
    [filteredPlayers, filteredTeams, weeklyWindow, league],
  )

  const [cachedRecapLines, setCachedRecapLines] = useState<typeof templateRecapLines>([])

  useEffect(() => {
    if (!weeklyWindow) {
      setCachedRecapLines([])
      return
    }
    let cancelled = false
    void fetchCachedWeeklyRecapLines(weeklyWindow.start, weeklyWindow.end, selectedLeagues).then(
      (lines) => {
        if (!cancelled) setCachedRecapLines(lines)
      },
    )
    return () => {
      cancelled = true
    }
  }, [weeklyWindow, selectedLeagues])

  const weeklyRecapLines =
    cachedRecapLines.length > 0 ? cachedRecapLines : templateRecapLines

  useGSAP(
    () => {
      scrollEntranceStagger(rootRef.current, '.overview-hub-card')
      refreshScrollTrigger()
    },
    { dependencies: [loading, league, split, weeklyPlayers.length] },
  )

  if (loading) {
    return <div className="card h-80" />
  }

  return (
    <div ref={rootRef} className="overview-hub">
      <section className="card overview-hub-card">
        <h2 className="card-title">Weekly Tier-1 Hub</h2>
        <p className="card-subtitle">
          League: <span className="text-accent">{league}</span> · Split:{' '}
          <span className="text-accent">{split}</span>
          {weeklyWindow ? ` · Past 7 days: ${weeklyWindow.label}` : ''}
          {weeklyWindow?.dataStale && weeklyWindow.latestDataDate
            ? ` · Data through ${formatGameDate(weeklyWindow.latestDataDate, { year: 'numeric' })}`
            : ''}
          {lastUpdated ? ` · Refreshed ${formatRefreshTimestamp(lastUpdated)}` : ''}
        </p>
      </section>

      {weeklyWindow && (
        <WeeklyRecap
          lines={weeklyRecapLines}
          windowLabel={weeklyWindow.label}
          leagueLabel={league}
          players={filteredPlayers}
          champions={filteredChampions}
        />
      )}

      <section className="card overview-hub-card">
        <h2 className="card-title">Player of the Week</h2>
        {!playerOfWeek ? (
          <p className="text-secondary">No weekly game log data for this filter.</p>
        ) : (
          <>
            <div className="overview-weekly-head">
              <div>
                <div className="overview-weekly-name">
                  <EntityLink type="player" name={playerOfWeek.base.name} player={playerOfWeek.base} allPlayers={filteredPlayers} showIcon={false} />
                </div>
                <div className="overview-weekly-meta entity-inline-row">
                  <EntityLink type="team" name={playerOfWeek.base.team} />
                  <span> · </span>
                  {playerOfWeek.role.toUpperCase()} · {playerOfWeek.weeklyGames.length}{' '}
                  {playerOfWeek.weeklyGames.length === 1 ? 'game' : 'games'} this week
                </div>
              </div>
              <div className="overview-weekly-highlight">
                {(() => {
                  const roleCohort = weeklyPlayers
                    .filter((p) => p.role === playerOfWeek.role)
                    .map((p) => p.weekly)
                  const hs = highestDeltaStat(playerOfWeek, roleCohort)
                  return (
                    <>
                      <span className="overview-pill-label">Highlight Stat</span>
                      <span className="overview-pill-value">
                        {hs.stat}: {formatNum(hs.value, 1)} ({hs.delta >= 0 ? '+' : ''}
                        {formatNum(hs.delta, 1)} vs role avg)
                      </span>
                    </>
                  )
                })()}
              </div>
            </div>
            <MetricScoreRow
              label="Average Performance Score"
              hint={PERFORMANCE_SCORE_HINT}
              value={formatNum(playerOfWeek.scoreAvg * 100, 1)}
            />
            <WeeklyRadar
              player={playerOfWeek.weekly}
              role={playerOfWeek.role}
              cohort={weeklyPlayers.filter((p) => p.role === playerOfWeek.role).map((p) => p.weekly)}
            />
            <div className="overview-best-games">
              <h3 className="card-title">Top 3 games this week (by performance score)</h3>
              <ul>
                {(() => {
                  const roleCohort = weeklyPlayers
                    .filter((p) => p.role === playerOfWeek.role)
                    .map((p) => p.weekly)
                  return [...playerOfWeek.weeklyGames]
                    .sort(
                      (a, b) =>
                        computeGameScore(b, playerOfWeek.role, roleCohort) -
                        computeGameScore(a, playerOfWeek.role, roleCohort),
                    )
                    .slice(0, 3)
                    .map((g, idx) => {
                      const opp = opponentLaneInfo(
                        filteredPlayers,
                        playerOfWeek.base.team,
                        playerOfWeek.role,
                        g,
                      )
                      const perfScore = computeGameScore(g, playerOfWeek.role, roleCohort)
                      return (
                        <li key={gameLogKey(playerOfWeek.base.team, g)} className="overview-best-game-row">
                          <span className="text-accent">
                            #{idx + 1} · {formatGameDate(g.date)}
                          </span>
                          <span className="entity-table-champ">
                            <ChampionEntityInline name={g.champion} iconSize={16} />
                            {' · '}{formatNum(perfScore * 100, 1)} perf · {formatNum(g.kda, 2)} KDA
                          </span>
                        <span className="text-secondary entity-inline-row">
                          vs <EntityLink type="team" name={opp.team} /> /{' '}
                          <EntityLink type="player" name={opp.player} allPlayers={filteredPlayers} showIcon={false} /> /{' '}
                          <ChampionEntityInline name={opp.champion} iconSize={16} />
                        </span>
                      </li>
                      )
                    })
                })()}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Team of the Week (Best 5 by role)</h2>
        <div className="overview-totw-grid">
          {teamOfWeek.map((p) => (
              <article key={`${p.base.name}-${p.role}`} className="overview-totw-card">
                <div className="overview-weekly-name">
                  <EntityLink type="player" name={p.base.name} player={p.base} allPlayers={filteredPlayers} showIcon={false} />
                </div>
                <div className="overview-weekly-meta entity-inline-row">
                  <EntityLink type="team" name={p.base.team} />
                  <span> · </span>
                  {p.role.toUpperCase()}
                </div>
                <WeeklyRadar
                  player={p.weekly}
                  role={p.role}
                  cohort={weeklyPlayers.filter((row) => row.role === p.role).map((row) => row.weekly)}
                  compact
                />
              </article>
            ))}
        </div>
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Hottest Team 🔥</h2>
        {!hottestTeam ? (
          <p className="text-secondary">Not enough weekly team data.</p>
        ) : (
          <div className="overview-hottest-layout">
            <div className="overview-hottest-grid">
              <div className="overview-weekly-name">
                <EntityLink type="team" name={hottestTeam.team} />
              </div>
              <MetricScoreRow
                label="Team Score"
                hint={TEAM_SCORE_HINT}
                value={formatNum(hottestTeam.impressiveness, 1)}
              />
              <div className="overview-hottest-stats">
                <div>Weekly WR: {formatPct(hottestTeam.weeklyWinrate, 1)}</div>
                <div>Weekly avg KDA: {formatNum(hottestTeam.weeklyAvgKda, 2)}</div>
                <div>Weekly avg GD@15: {formatNum(hottestTeam.weeklyAvgGd15, 1)}</div>
                <div>Weekly avg Obj Control: {formatNum(hottestTeam.weeklyObjControl, 2)}</div>
                <div>Opponent split WR avg: {formatPct(hottestTeam.avgOpponentSplitWinrate, 1)}</div>
                <div>Upset wins bonus: {hottestTeam.upsetWins}</div>
              </div>
            </div>
            {hottestTeamEntity && (
              <div className="overview-hottest-radar">
                <TeamRadarChart team={hottestTeamEntity} cohort={filteredTeams} highlighted />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Champion of the Week</h2>
        {!championOpResult.top ? (
          <p className="text-secondary">No champion weekly sample for this filter.</p>
        ) : (
          <div className="overview-champion-week">
            <div className="overview-weekly-name">
              <EntityLink type="champion" name={championOpResult.top.champion.name} />
            </div>
            <div className="overview-weekly-meta">
              Role: {championOpResult.top.role.toUpperCase()} · {championOpResult.top.samplePicks}{' '}
              {championOpResult.top.samplePicks === 1 ? 'game' : 'games'} · Presence:{' '}
              {formatPct(championOpResult.top.champion.presence, 1)} · Winrate:{' '}
              {formatPct(championOpResult.top.champion.winrate, 1)}
            </div>
            <MetricScoreRow
              label="OP Score"
              hint={OP_SCORE_HINT}
              value={formatNum(championOpResult.top.opScore, 2)}
            />
            <div className="overview-hottest-stats">
              <div>Presence: {formatPct(championOpResult.top.champion.presence, 1)}</div>
              <div>Winrate: {formatPct(championOpResult.top.champion.winrate, 1)}</div>
              <div>Ban rate: {formatPct(championOpResult.top.champion.banRate, 1)}</div>
              <div>Avg KDA: {formatNum(championOpResult.top.champion.avgKda, 2)}</div>
              <div>Sample confidence: {formatPct(championOpResult.top.confidence * 100, 0)}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
