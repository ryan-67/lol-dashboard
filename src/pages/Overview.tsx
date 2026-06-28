import { useMemo, useRef, useState, useEffect, useTransition } from 'react'
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
  ROLE_METRICS,
  buildRadarSeries,
  computeGameScore,
  getMetricValue,
  highestDeltaStatForGame,
  normalizePosition,
  playersForRole,
} from '../lib/playerRadar'
import { radarColorForPlayer } from '../lib/entities/teamBrandColor'
import { aggregateAdvancedFromGameLog } from '../lib/advancedStats'
import { findTeamByName } from '../lib/teamAnalytics'
import TeamRadarChart from '../components/teams/TeamRadarChart'
import { EntityLink, ChampionEntityInline } from '../components/entities'
import WeeklyRecap from '../components/overview/WeeklyRecap'
import OverviewHubToggle from '../components/overview/OverviewHubToggle'
import { buildWeeklyRecapLines } from '../lib/weeklyRecap'
import { fetchCachedWeeklyRecapLines } from '../lib/loadWeeklyRecap'
import {
  getHubWindow,
  inHubWindow,
  localIsoDate,
  HUB_PERIOD_DAYS,
  type HubPeriod,
  type WeeklyWindow,
} from '../lib/weeklyWindow'
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

const HUB_COPY = {
  weekly: {
    hubTitle: 'Weekly Tier-1 Hub',
    periodDays: HUB_PERIOD_DAYS.weekly,
    recapTitle: 'Weekly Recap',
    playerTitle: 'Player of the Week',
    teamTitle: 'Team of the Week (Best 5 by role)',
    championTitle: 'Champion of the Week',
    topGamesTitle: 'Top 3 games this week (by performance score)',
    noPlayerData: 'No weekly game log data for this filter.',
    noTeamData: 'Not enough weekly team data.',
    noChampionData: 'No champion weekly sample for this filter.',
    recapLimit: 8,
    gamesLabel: (count: number) =>
      `${count} ${count === 1 ? 'game' : 'games'} this week`,
    statWr: 'Weekly WR',
    statKda: 'Weekly avg KDA',
    statGd: 'Weekly avg GD@15',
    statObj: 'Weekly avg Obj Control',
  },
  monthly: {
    hubTitle: 'Monthly Tier-1 Hub',
    periodDays: HUB_PERIOD_DAYS.monthly,
    recapTitle: 'Monthly Recap',
    playerTitle: 'Player of the Month',
    teamTitle: 'Team of the Month (Best 5 by role)',
    championTitle: 'Champion of the Month',
    topGamesTitle: 'Top 3 games this month (by performance score)',
    noPlayerData: 'No monthly game log data for this filter.',
    noTeamData: 'Not enough monthly team data.',
    noChampionData: 'No champion monthly sample for this filter.',
    recapLimit: 24,
    gamesLabel: (count: number) =>
      `${count} ${count === 1 ? 'game' : 'games'} this month`,
    statWr: 'Monthly WR',
    statKda: 'Monthly avg KDA',
    statGd: 'Monthly avg GD@15',
    statObj: 'Monthly avg Obj Control',
  },
} as const satisfies Record<
  HubPeriod,
  {
    hubTitle: string
    periodDays: number
    recapTitle: string
    playerTitle: string
    teamTitle: string
    championTitle: string
    topGamesTitle: string
    noPlayerData: string
    noTeamData: string
    noChampionData: string
    recapLimit: number
    gamesLabel: (count: number) => string
    statWr: string
    statKda: string
    statGd: string
    statObj: string
  }
>

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
    gd15: avg(logs.map((g) => g.gd15).filter((v): v is number => typeof v === 'number')),
    csd15: avg(logs.map((g) => g.csd15).filter((v): v is number => typeof v === 'number')),
    xpd15: avg(logs.map((g) => g.xpd15).filter((v): v is number => typeof v === 'number')),
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
    const logs = (player.gameLog ?? []).filter((g) => inHubWindow(g, window))
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
      avg(roleCohort.map((c) => Number(getMetricValue(c, def.key, { cohort: roleCohort }) ?? 0))) || 0
    const val = Number(getMetricValue(player.weekly, def.key, { cohort: roleCohort }) ?? 0)
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
    entry.weeklyAvgGd15 += avg(matches.map((m) => m.gd15).filter((v): v is number => typeof v === 'number'))
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
  const color = radarColorForPlayer(player.team, player.league)
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
    weeklyHubPlayers,
    weeklyHubTeams,
    weeklyHubChampions,
    weeklyHubGameCatalog,
    loading,
    league,
    split,
    lastUpdated,
    selectedLeagues,
  } = useDashboard()
  const rootRef = useRef<HTMLDivElement>(null)
  const [hubPeriod, setHubPeriod] = useState<HubPeriod>('weekly')
  const [displayPeriod, setDisplayPeriod] = useState<HubPeriod>('weekly')
  const [isPeriodPending, startPeriodTransition] = useTransition()
  const [recapLoading, setRecapLoading] = useState(false)

  const hubContentLoading = isPeriodPending || recapLoading

  const handleHubPeriodChange = (period: HubPeriod) => {
    if (period === hubPeriod) return
    setHubPeriod(period)
    setRecapLoading(true)
    startPeriodTransition(() => {
      setDisplayPeriod(period)
    })
  }

  const copy = HUB_COPY[displayPeriod]

  const hubWindow = useMemo(
    () => getHubWindow(weeklyHubPlayers, displayPeriod),
    [weeklyHubPlayers, displayPeriod],
  )
  const weeklyPlayers = useMemo(
    () => (hubWindow ? getWeeklyPlayers(weeklyHubPlayers, hubWindow) : []),
    [weeklyHubPlayers, hubWindow],
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
    () => calculateHottestTeams(weeklyPlayers, weeklyHubTeams.map((t) => ({ name: t.name, winrate: t.winrate }))),
    [weeklyPlayers, weeklyHubTeams],
  )
  const hottestTeam = hottestTeams[0] ?? null
  const hottestTeamEntity = useMemo(
    () => (hottestTeam ? findTeamByName(weeklyHubTeams, hottestTeam.team) : null),
    [hottestTeam, weeklyHubTeams],
  )

  const championOpResult = useMemo(() => {
    if (!hubWindow) return { top: null, runners: [] }
    const stats = buildWeeklyChampionStatsFromPlayers(
      weeklyPlayers,
      weeklyHubChampions,
      { start: hubWindow.key, end: localIsoDate(hubWindow.end) },
    )
    return computeChampionOfWeekScores(stats)
  }, [weeklyPlayers, weeklyHubChampions, hubWindow])

  const templateRecapLines = useMemo(() => {
    if (!hubWindow) return []
    return buildWeeklyRecapLines(
      weeklyHubPlayers,
      weeklyHubTeams,
      hubWindow,
      league,
      weeklyHubGameCatalog,
    ).slice(0, copy.recapLimit)
  }, [weeklyHubPlayers, weeklyHubTeams, hubWindow, league, copy.recapLimit, weeklyHubGameCatalog])

  const [cachedRecapLines, setCachedRecapLines] = useState<typeof templateRecapLines>([])

  useEffect(() => {
    if (!hubWindow) {
      setCachedRecapLines([])
      setRecapLoading(false)
      return
    }

    let cancelled = false
    void fetchCachedWeeklyRecapLines(
      hubWindow.start,
      hubWindow.end,
      selectedLeagues,
      copy.recapLimit,
    ).then((lines) => {
      if (!cancelled) {
        setCachedRecapLines(lines)
        setRecapLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [hubWindow, selectedLeagues, copy.recapLimit])

  const weeklyRecapLines =
    cachedRecapLines.length > 0 ? cachedRecapLines : templateRecapLines

  useGSAP(
    () => {
      scrollEntranceStagger(rootRef.current, '.overview-hub-card')
      refreshScrollTrigger()
    },
    { dependencies: [loading, league, split, displayPeriod, weeklyPlayers.length, hubContentLoading] },
  )

  if (loading) {
    return <div className="card h-80" />
  }

  return (
    <div ref={rootRef} className="overview-hub">
      <OverviewHubToggle value={hubPeriod} onChange={handleHubPeriodChange} />

      {hubContentLoading ? (
        <section className="card overview-hub-card overview-hub-loading">
          <p className="text-secondary text-sm">loading...</p>
        </section>
      ) : (
        <>
      <section className="card overview-hub-card">
        <h2 className="card-title">{copy.hubTitle}</h2>
        <p className="card-subtitle">
          League: <span className="text-accent">{league}</span> · Split:{' '}
          <span className="text-accent">{split}</span>
          {hubWindow ? ` · Past ${copy.periodDays} days: ${hubWindow.label}` : ''}
          {hubWindow?.dataStale && hubWindow.latestDataDate
            ? ` · Data through ${formatGameDate(hubWindow.latestDataDate, { year: 'numeric' })}`
            : ''}
          {lastUpdated ? ` · Refreshed ${formatRefreshTimestamp(lastUpdated)}` : ''}
        </p>
      </section>

      {hubWindow && (
        <WeeklyRecap
          lines={weeklyRecapLines}
          windowLabel={hubWindow.label}
          players={weeklyHubPlayers}
          champions={weeklyHubChampions}
          title={copy.recapTitle}
        />
      )}

      <section className="card overview-hub-card">
        <h2 className="card-title">{copy.playerTitle}</h2>
        {!playerOfWeek ? (
          <p className="text-secondary">{copy.noPlayerData}</p>
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
                  {playerOfWeek.role.toUpperCase()} · {copy.gamesLabel(playerOfWeek.weeklyGames.length)}
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
              <h3 className="card-title">{copy.topGamesTitle}</h3>
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
                        weeklyHubPlayers,
                        playerOfWeek.base.team,
                        playerOfWeek.role,
                        g,
                      )
                      const perfScore = computeGameScore(g, playerOfWeek.role, roleCohort)
                      const highlight = highestDeltaStatForGame(g, playerOfWeek.role, roleCohort)
                      const kdaLine = `${g.kills ?? 0}/${g.deaths ?? 0}/${g.assists ?? 0}`
                      return (
                        <li key={gameLogKey(playerOfWeek.base.team, g)} className="overview-best-game-row">
                          <span className="text-accent">
                            #{idx + 1} · {formatGameDate(g.date)}
                          </span>
                          <span className="entity-table-champ">
                            <ChampionEntityInline name={g.champion} iconSize={16} />
                            {' · '}{formatNum(perfScore * 100, 1)} perf · {kdaLine} K/D/A
                            {highlight ? (
                              <>
                                {' · '}
                                {highlight.stat}{' '}
                                {highlight.value > 0 && highlight.delta > 0 ? '+' : ''}
                                {formatNum(highlight.value, 1)} (
                                {highlight.delta >= 0 ? '+' : ''}
                                {formatNum(highlight.delta, 1)} vs avg)
                              </>
                            ) : null}
                          </span>
                        <span className="text-secondary entity-inline-row">
                          vs <EntityLink type="team" name={opp.team} /> /{' '}
                          <EntityLink type="player" name={opp.player} allPlayers={weeklyHubPlayers} showIcon={false} /> /{' '}
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
        <h2 className="card-title">{copy.teamTitle}</h2>
        {!teamOfWeek.length ? (
          <p className="text-secondary">{copy.noPlayerData}</p>
        ) : (
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
        )}
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Hottest Team 🔥</h2>
        {!hottestTeam ? (
          <p className="text-secondary">{copy.noTeamData}</p>
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
                <div>{copy.statWr}: {formatPct(hottestTeam.weeklyWinrate, 1)}</div>
                <div>{copy.statKda}: {formatNum(hottestTeam.weeklyAvgKda, 2)}</div>
                <div>{copy.statGd}: {formatNum(hottestTeam.weeklyAvgGd15, 1)}</div>
                <div>{copy.statObj}: {formatNum(hottestTeam.weeklyObjControl, 2)}</div>
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
        <h2 className="card-title">{copy.championTitle}</h2>
        {!championOpResult.top ? (
          <p className="text-secondary">{copy.noChampionData}</p>
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
        </>
      )}
    </div>
  )
}
