import { useMemo, useRef, useState, useEffect, useTransition } from 'react'
import { useGSAP } from '@gsap/react'
import { useDashboard } from '../context/DashboardContext'
import { type Player, type PlayerGameLog } from '../hooks/useDashboardData'
import {
  ROLES,
  computeRecencyWeightedOpScores,
  isDisplayableChampion,
  type RoleKey,
} from '../lib/championAnalytics'
import { calculateHottestTeams } from '../lib/hottestTeam'
import {
  fetchRegionStrength,
  lookupTeamElo,
  type RegionStrengthBundle,
} from '../lib/loadRegionStrength'
import {
  buildWeeklyChampionStatsFromPlayers,
  championOpStatBreakdown,
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
import { teamMatchesCanonical } from '../lib/entities/slugs'
import { aggregateAdvancedFromGameLog } from '../lib/advancedStats'
import { findTeamByName } from '../lib/teamAnalytics'
import {
  isOverviewSpotlightPlayer,
  isTier1Player,
  isTier1Team,
  isInternationalLeagueKey,
} from '../lib/mergeSlices'
import TeamRadarChart from '../components/teams/TeamRadarChart'
import { EntityLink, ChampionEntityInline } from '../components/entities'
import WeeklyRecap from '../components/overview/WeeklyRecap'
import OverviewHubToggle from '../components/overview/OverviewHubToggle'
import OverviewPaneToggle from '../components/overview/OverviewPaneToggle'
import OverviewBoard from '../components/overview/OverviewBoard'
import SectionSubnav, { type SectionSubnavItem } from '../components/ui/SectionSubnav'
import PowerRankingsPanel from '../components/rankings/PowerRankingsPanel'
import TeamPowerBoard from '../components/rankings/TeamPowerBoard'
import ScoreCaveat from '../components/ui/ScoreCaveat'
import { MODEL_POWER_RANKINGS_SUBTITLE } from '../lib/metricHints'
import { powerRegionsFromSelectedLeagues } from '../lib/powerRegionFilter'
import { buildWeeklyRecapLines } from '../lib/weeklyRecap'
import { mergeWeeklyRecapLines } from '../lib/recapMerge'
import { fetchCachedWeeklyRecapLines } from '../lib/loadWeeklyRecap'
import { fetchCitoSeriesResults, type CitoSeriesResult } from '../lib/citoSeriesVerify'
import { resolveGameOpponent } from '../lib/gameOpponent'
import {
  getHubWindow,
  inHubWindow,
  latestCitoCompletedDate,
  localIsoDate,
  HUB_PERIOD_DAYS,
  type HubPeriod,
  type WeeklyWindow,
} from '../lib/weeklyWindow'
import {
  readLocalOverviewPane,
  writeLocalOverviewPane,
  type OverviewPane,
} from '../lib/overviewPane'
import { CHART } from '../theme/chartTheme'
import {
  scrollEntranceStagger,
  refreshScrollTrigger,
  animateRadarDraw,
} from '../theme/animations'
import AnimatedCounter from '../components/ui/AnimatedCounter'
import KpiTile from '../components/ui/KpiTile'
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
import ChartFrame from '../components/ui/ChartFrame'
import { MetricScoreRow } from '../components/ui/MetricHint'
import {
  OP_SCORE_HINT,
  PERFORMANCE_SCORE_HINT,
  TEAM_SCORE_HINT,
} from '../lib/metricHints'
import { opScoreTo100, unitIntervalTo100 } from '../lib/scoreNormalize'

const OVERVIEW_SUBNAV_ITEMS: SectionSubnavItem[] = [
  { id: 'overview-recap', label: 'Recap' },
  { id: 'overview-standouts', label: 'Standouts' },
  { id: 'overview-rankings', label: 'Rankings' },
]

const HUB_COPY = {
  weekly: {
    hubTitle: 'Weekly Tier-1 Hub',
    periodDays: HUB_PERIOD_DAYS.weekly,
    recapTitle: 'Weekly Recap',
    playerTitle: 'Player of the Week',
    teamTitle: 'Team of the Week (Best 5 by role)',
    championTitle: 'Champion of the Week',
    championSubtitle:
      'Highest OP Score — draft meta (presence, pick/ban, win rate) plus in-game stats from the role radar, confidence-adjusted by games played.',
    topGamesTitle: 'Top 3 games this week (by performance score)',
    noPlayerData: 'No weekly game log data for this filter.',
    noTeamData: 'Not enough weekly team data.',
    noChampionData: 'No champion weekly sample for this filter.',
    /** Initial visible series; full week is available via View more. */
    recapLimit: 8,
    recapFetchLimit: 48,
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
    championSubtitle:
      'Highest OP Score — draft meta (presence, pick/ban, win rate) plus in-game stats from the role radar, confidence-adjusted by games played.',
    topGamesTitle: 'Top 3 games this month (by performance score)',
    noPlayerData: 'No monthly game log data for this filter.',
    noTeamData: 'Not enough monthly team data.',
    noChampionData: 'No champion monthly sample for this filter.',
    recapLimit: 12,
    recapFetchLimit: 80,
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
    championSubtitle: string
    topGamesTitle: string
    noPlayerData: string
    noTeamData: string
    noChampionData: string
    recapLimit: number
    recapFetchLimit: number
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
    // Tier-1 focused hub: drop pure minor-region domestic standouts (e.g. LFL).
    if (!isOverviewSpotlightPlayer(player, logs)) continue
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

/** Prefer tier-1 for each role slot; only fall back to intl guests if no tier-1 candidate. */
function pickBestByRolePreferTier1(weeklyPlayers: WeeklyPlayer[]): WeeklyPlayer[] {
  return ROLES.map((role) => {
    const rolePlayers = weeklyPlayers.filter((p) => p.role === role)
    const tier1 = rolePlayers
      .filter((p) => isTier1Player(p.base))
      .sort((a, b) => b.scoreAvg - a.scoreAvg)
    if (tier1[0]) return tier1[0]
    const intlGuest = rolePlayers
      .filter((p) => p.weeklyGames.some((g) => isInternationalLeagueKey(g.league)))
      .sort((a, b) => b.scoreAvg - a.scoreAvg)
    return intlGuest[0] ?? null
  }).filter((p): p is WeeklyPlayer => p !== null)
}

function pickPlayerOfPeriodPreferTier1(weeklyPlayers: WeeklyPlayer[]): WeeklyPlayer | null {
  const tier1 = weeklyPlayers
    .filter((p) => isTier1Player(p.base))
    .sort((a, b) => b.scoreAvg - a.scoreAvg)
  if (tier1[0]) return tier1[0]
  const intlGuest = weeklyPlayers
    .filter((p) => p.weeklyGames.some((g) => isInternationalLeagueKey(g.league)))
    .sort((a, b) => b.scoreAvg - a.scoreAvg)
  return intlGuest[0] ?? null
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
  gameCatalog?: Record<string, import('../hooks/useDashboardData').GameCatalogEntry>,
): OpponentLane {
  const team = resolveGameOpponent(log, playerTeam, allPlayers, gameCatalog)

  if (!team) {
    const sameDatePeers = allPlayers.filter((p) => {
      if (teamMatchesCanonical(p.team, playerTeam)) return false
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
    (p) => teamMatchesCanonical(p.team, team) && normalizePosition(p.position) === role,
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
    <ChartFrame className="overview-weekly-radar" kind="radar" hideShare>
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
            fillOpacity={0.18}
            strokeWidth={2.25}
            dot={{ r: 3.5, fill: color, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export default function Overview() {
  const {
    filteredPlayers,
    filteredTeams,
    filteredChampions,
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
  const [overviewPane, setOverviewPane] = useState<OverviewPane>(() => readLocalOverviewPane())
  const [hubPeriod, setHubPeriod] = useState<HubPeriod>('weekly')
  const [displayPeriod, setDisplayPeriod] = useState<HubPeriod>('weekly')
  const [isPeriodPending, startPeriodTransition] = useTransition()
  // Start true so we never flash template recaps before Supabase AI cache loads.
  const [recapLoading, setRecapLoading] = useState(true)
  const [recapReady, setRecapReady] = useState(false)

  const hubContentLoading = isPeriodPending || recapLoading || !recapReady

  const handleOverviewPaneChange = (pane: OverviewPane) => {
    setOverviewPane(pane)
    writeLocalOverviewPane(pane)
  }

  const powerRegions = useMemo(
    () => powerRegionsFromSelectedLeagues(selectedLeagues),
    [selectedLeagues],
  )

  const handleHubPeriodChange = (period: HubPeriod) => {
    if (period === hubPeriod) return
    setHubPeriod(period)
    setRecapLoading(true)
    startPeriodTransition(() => {
      setDisplayPeriod(period)
    })
  }

  const copy = HUB_COPY[displayPeriod]

  const [citoResults, setCitoResults] = useState<CitoSeriesResult[]>([])
  const [regionStrength, setRegionStrength] = useState<RegionStrengthBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchCitoSeriesResults({ sinceDays: 45 }).then((rows) => {
      if (!cancelled) setCitoResults(rows)
    })
    void fetchRegionStrength().then((bundle) => {
      if (!cancelled) setRegionStrength(bundle)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const citoLatestDate = useMemo(() => latestCitoCompletedDate(citoResults), [citoResults])

  const hubWindow = useMemo(
    () => getHubWindow(weeklyHubPlayers, displayPeriod, { citoLatestDate }),
    [weeklyHubPlayers, displayPeriod, citoLatestDate],
  )
  const weeklyPlayers = useMemo(
    () => (hubWindow ? getWeeklyPlayers(weeklyHubPlayers, hubWindow) : []),
    [weeklyHubPlayers, hubWindow],
  )

  const playerOfWeek = useMemo(
    () => pickPlayerOfPeriodPreferTier1(weeklyPlayers),
    [weeklyPlayers],
  )

  const teamOfWeek = useMemo(
    () => pickBestByRolePreferTier1(weeklyPlayers),
    [weeklyPlayers],
  )

  const hottestTeams = useMemo(() => {
    const tier1Weekly = weeklyPlayers.filter((p) => isTier1Player(p.base))
    const pool = tier1Weekly.length ? tier1Weekly : weeklyPlayers
    const tier1Teams = weeklyHubTeams.filter((t) => isTier1Team(t))
    const teamPool = tier1Teams.length ? tier1Teams : weeklyHubTeams
    const eloMap = new Map<string, number>()
    if (regionStrength?.teams) {
      for (const [name] of Object.entries(regionStrength.teams)) {
        const elo = lookupTeamElo(regionStrength, name)
        if (elo != null) eloMap.set(name, elo)
      }
    }
    return calculateHottestTeams(
      pool.map((p) => ({
        team: p.base.team,
        role: p.role,
        weeklyGames: p.weeklyGames,
      })),
      {
        allPlayers: weeklyHubPlayers,
        splitWinrates: teamPool.map((t) => ({ name: t.name, winrate: t.winrate })),
        teamElo: eloMap.size ? eloMap : null,
      },
    )
  }, [weeklyPlayers, weeklyHubTeams, weeklyHubPlayers, regionStrength])
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

  const topOpChampions = useMemo(() => {
    const displayable = filteredChampions.filter(isDisplayableChampion)
    return computeRecencyWeightedOpScores(displayable, {
      asOf: hubWindow?.end ?? new Date(),
      halfLifeDays: 14,
      minPresence: 12,
    }).all.slice(0, 10)
  }, [filteredChampions, hubWindow])

  const templateRecapLines = useMemo(() => {
    if (!hubWindow) return []
    return buildWeeklyRecapLines(
      weeklyHubPlayers,
      weeklyHubTeams,
      hubWindow,
      league,
      weeklyHubGameCatalog,
      citoResults,
    )
  }, [weeklyHubPlayers, weeklyHubTeams, hubWindow, league, weeklyHubGameCatalog, citoResults])

  const [cachedRecapLines, setCachedRecapLines] = useState<typeof templateRecapLines>([])

  useEffect(() => {
    if (!hubWindow) {
      setCachedRecapLines([])
      setRecapLoading(false)
      setRecapReady(true)
      return
    }

    let cancelled = false
    setRecapLoading(true)
    setRecapReady(false)
    void fetchCachedWeeklyRecapLines(
      hubWindow.start,
      hubWindow.end,
      selectedLeagues,
      copy.recapFetchLimit,
    )
      .then((lines) => {
        if (!cancelled) {
          setCachedRecapLines(lines)
        }
      })
      .catch(() => {
        if (!cancelled) setCachedRecapLines([])
      })
      .finally(() => {
        if (!cancelled) {
          setRecapLoading(false)
          setRecapReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [hubWindow, selectedLeagues, copy.recapFetchLimit])

  const weeklyRecapLines = mergeWeeklyRecapLines(
    cachedRecapLines,
    templateRecapLines,
    copy.recapFetchLimit,
  )

  const sampleGames = useMemo(
    () => weeklyPlayers.reduce((sum, p) => sum + p.weeklyGames.length, 0),
    [weeklyPlayers],
  )

  /** Per-game KDA trace behind the top-performer readout — context, not decoration. */
  const topPerformerSpark = useMemo(() => {
    if (!playerOfWeek || playerOfWeek.weeklyGames.length < 3) return undefined
    return playerOfWeek.weeklyGames
      .slice()
      .reverse()
      .map((game) => game.kda ?? 0)
  }, [playerOfWeek])

  useGSAP(
    () => {
      scrollEntranceStagger(rootRef.current, '.overview-hub-card')
      scrollEntranceStagger(rootRef.current, '.overview-stat-cell')
      rootRef.current
        ?.querySelectorAll('.overview-weekly-radar, .overview-hottest-radar, .overview-totw-card')
        .forEach((el) => animateRadarDraw(el, 0.7))
      refreshScrollTrigger()
    },
    { dependencies: [loading, league, split, displayPeriod, weeklyPlayers.length, hubContentLoading] },
  )

  if (loading) {
    return (
      <div className="overview-hub overview-hub--skeleton" aria-busy="true">
        <section className="card overview-hub-card">
          <div className="dash-skeleton-block dash-skeleton-block--lg" />
          <div className="dash-skeleton-strip">
            <div className="dash-skeleton-block" />
            <div className="dash-skeleton-block" />
            <div className="dash-skeleton-block" />
          </div>
        </section>
        <section className="card overview-hub-card">
          <div className="dash-skeleton-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="dash-skeleton-row" />
            ))}
          </div>
        </section>
      </div>
    )
  }

  const freshnessStamp = (() => {
    if (!hubWindow?.latestDataDate) return ''
    const through = formatGameDate(hubWindow.latestDataDate, { year: 'numeric' })
    const oeLag =
      hubWindow.oeLatestDate &&
      hubWindow.citoLatestDate &&
      hubWindow.oeLatestDate.getTime() < hubWindow.citoLatestDate.getTime()
    const source = oeLag ? ' (Cito)' : ''
    if (hubWindow.dataStale || oeLag) return ` · Data through ${through}${source}`
    return ` · Data through ${through}`
  })()

  return (
    <div ref={rootRef} className="overview-hub">
      <OverviewPaneToggle value={overviewPane} onChange={handleOverviewPaneChange} />

      {overviewPane === 'board' ? (
        <OverviewBoard />
      ) : (
        <>
      <SectionSubnav
        key={hubContentLoading ? 'overview-subnav-pending' : 'overview-subnav-ready'}
        items={OVERVIEW_SUBNAV_ITEMS}
      />
      <OverviewHubToggle value={hubPeriod} onChange={handleHubPeriodChange} />

      {hubContentLoading ? (
        <section className="card overview-hub-card overview-hub-loading" aria-busy="true">
          <div className="dash-skeleton-block dash-skeleton-block--lg" />
          <div className="dash-skeleton-strip">
            <div className="dash-skeleton-block" />
            <div className="dash-skeleton-block" />
            <div className="dash-skeleton-block" />
          </div>
          <div className="dash-skeleton-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dash-skeleton-row" />
            ))}
          </div>
        </section>
      ) : (
        <div key={displayPeriod} className="instrument-swap">
      <section id="overview-recap" className="overview-section">
      <section className="card overview-hub-card overview-hub-hero">
        <div className="overview-hub-hero-copy">
          <p className="page-header-eyebrow">tier-1 signal</p>
          <h2 className="card-title">{copy.hubTitle}</h2>
          <p className="card-subtitle">
            League: <span className="text-accent">{league}</span>
            {hubWindow ? ` · Past ${copy.periodDays} days: ${hubWindow.label}` : ''}
            {freshnessStamp}
            {lastUpdated ? ` · OE shards ${formatRefreshTimestamp(lastUpdated)}` : ''}
          </p>
        </div>
      </section>

      <div className="dash-kpi-grid" aria-label="Hub snapshot">
        <KpiTile
          label="active players"
          value={weeklyPlayers.length}
          meta={`${copy.periodDays}d window`}
        />
        <KpiTile
          label="game rows"
          value={sampleGames}
          meta={hubWindow?.label ?? 'current window'}
        />
        <KpiTile
          label="top perf"
          value={playerOfWeek ? playerOfWeek.scoreAvg * 100 : 0}
          decimals={1}
          accent
          gauge={playerOfWeek ? playerOfWeek.scoreAvg : 0}
          spark={topPerformerSpark}
          meta={playerOfWeek ? playerOfWeek.base.name : '—'}
        />
        <KpiTile
          label="hottest wr"
          value={hottestTeam?.weeklyWinrate ?? 0}
          suffix="%"
          accent
          gauge={(hottestTeam?.weeklyWinrate ?? 0) / 100}
          meta={hottestTeam?.team ?? '—'}
        />
      </div>

      {hubWindow && (
        <WeeklyRecap
          lines={weeklyRecapLines}
          windowLabel={hubWindow.label}
          players={weeklyHubPlayers}
          champions={weeklyHubChampions}
          title={copy.recapTitle}
          initialVisible={copy.recapLimit}
        />
      )}
      </section>

      <section id="overview-standouts" className="overview-section">
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
                        weeklyHubGameCatalog,
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
                <div className="overview-totw-name-row">
                  <div className="overview-weekly-name">
                    <EntityLink type="player" name={p.base.name} player={p.base} allPlayers={filteredPlayers} showIcon={false} />
                  </div>
                  <span className="overview-totw-score" title="Average performance score /100">
                    {formatNum(unitIntervalTo100(p.scoreAvg), 1)}
                  </span>
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
        <h2 className="card-title">Hottest Team</h2>
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
                <div className="overview-stat-tile">
                  <span className="overview-stat-label">{copy.statWr}</span>
                  <AnimatedCounter
                    className="overview-stat-value overview-stat-value--sm"
                    value={hottestTeam.weeklyWinrate}
                    decimals={1}
                    suffix="%"
                  />
                </div>
                <div className="overview-stat-tile">
                  <span className="overview-stat-label">{copy.statKda}</span>
                  <AnimatedCounter
                    className="overview-stat-value overview-stat-value--sm"
                    value={hottestTeam.weeklyAvgKda}
                    decimals={2}
                  />
                </div>
                <div className="overview-stat-tile">
                  <span className="overview-stat-label">{copy.statGd}</span>
                  <AnimatedCounter
                    className="overview-stat-value overview-stat-value--sm"
                    value={hottestTeam.weeklyAvgGd15}
                    decimals={1}
                  />
                </div>
                <div className="overview-stat-tile">
                  <span className="overview-stat-label">{copy.statObj}</span>
                  <AnimatedCounter
                    className="overview-stat-value overview-stat-value--sm"
                    value={hottestTeam.weeklyObjControl}
                    decimals={2}
                  />
                </div>
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
        <p className="card-subtitle">{copy.championSubtitle}</p>
        {!championOpResult.top ? (
          <p className="text-secondary">{copy.noChampionData}</p>
        ) : (
          <div className="overview-champion-week">
            <div className="overview-weekly-name">
              <EntityLink type="champion" name={championOpResult.top.champion.name} />
            </div>
            <div className="overview-weekly-meta">
              Role: {championOpResult.top.role.toUpperCase()} · {championOpResult.top.samplePicks}{' '}
              {championOpResult.top.samplePicks === 1 ? 'game' : 'games'}
            </div>
            <MetricScoreRow
              label="OP Score"
              hint={OP_SCORE_HINT}
              value={formatNum(opScoreTo100(championOpResult.top.opScore), 1)}
            />
            <div className="overview-hottest-stats">
              {championOpStatBreakdown(championOpResult.top).map((row) => (
                <div key={row.label}>
                  {row.label}: {row.value}
                </div>
              ))}
              <div>Sample confidence: {formatPct(championOpResult.top.confidence * 100, 0)}</div>
            </div>
          </div>
        )}
      </section>
      </section>

      <section id="overview-rankings" className="overview-section">
        <ScoreCaveat label="standouts vs model rankings" />
        <div className="overview-rankings-grid">
          <PowerRankingsPanel
            limit={8}
            title="nucky power rankings"
            subtitle={MODEL_POWER_RANKINGS_SUBTITLE}
            regions={powerRegions}
          />
          <TeamPowerBoard regions={powerRegions} limit={8} />
        </div>

        <section className="card overview-hub-card">
          <h2 className="card-title">Champion Power Rankings</h2>
          <p className="card-subtitle">
            Top 10 by recency-weighted OP score (14-day half-life on weekly presence/WR/ban) —
            current patch priority, not full-split nostalgia. Distinct from Champion of the Week
            above.
          </p>
          {topOpChampions.length === 0 ? (
            <p className="text-secondary">Not enough champion data for the current filters.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Champion</th>
                    <th>Presence</th>
                    <th>Win %</th>
                    <th title={OP_SCORE_HINT}>OP Score</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpChampions.map((entry, idx) => (
                    <tr key={entry.champion.name}>
                      <td className="text-secondary">#{idx + 1}</td>
                      <td className="font-medium">
                        <ChampionEntityInline name={entry.champion.name} iconSize={20} />
                      </td>
                      <td className="text-secondary">{formatPct(entry.champion.presence, 1)}</td>
                      <td className="text-secondary">{formatPct(entry.champion.winrate, 1)}</td>
                      <td className="text-accent font-medium">
                        {formatNum(opScoreTo100(entry.opScore), 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
        </div>
      )}
        </>
      )}
    </div>
  )
}
