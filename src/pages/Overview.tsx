import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { DEFAULT_YEAR, useDashboard } from '../context/DashboardContext'
import { DEFAULT_SPLIT, type Champion, type Player, type PlayerGameLog } from '../hooks/useDashboardData'
import {
  ROLES,
  computeOpScores,
  type RoleKey,
} from '../lib/championAnalytics'
import {
  PLAYERS_ROLE_COLORS,
  ROLE_METRICS,
  buildRadarSeries,
  computeGameScore,
  normalizePosition,
  playersForRole,
  type RadarMetricKey,
} from '../lib/playerRadar'
import { findTeamByName } from '../lib/teamAnalytics'
import TeamRadarChart from '../components/teams/TeamRadarChart'
import { CHART } from '../theme/chartTheme'
import {
  scrollEntranceStagger,
  refreshScrollTrigger,
} from '../theme/animations'
import { formatNum, formatPct } from '../lib/format'
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

interface WeeklyWindow {
  start: Date
  end: Date
  key: string
  label: string
  latestDataDate: Date | null
  dataStale: boolean
}

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

const METRIC_LABELS: Partial<Record<RadarMetricKey, string>> = {
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
}

function parseDate(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function startOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(23, 59, 59, 999)
  return out
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function weekLabel(start: Date, end: Date): string {
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** Rolling 7-day window ending today for the active split; last 7 days of data for historical splits. */
function getWeeklyWindow(players: Player[], year: string, split: string): WeeklyWindow | null {
  const dates = players
    .flatMap((p) => p.gameLog ?? [])
    .map((g) => parseDate(g.date))
    .filter((d): d is Date => d !== null)
  if (!dates.length) return null
  dates.sort((a, b) => a.getTime() - b.getTime())
  const latestDataDate = dates[dates.length - 1]
  const today = startOfDay(new Date())
  const isCurrentContext = year === DEFAULT_YEAR && split === DEFAULT_SPLIT

  const anchorEnd = isCurrentContext ? endOfDay(today) : endOfDay(latestDataDate)
  const start = startOfDay(new Date(anchorEnd))
  start.setDate(start.getDate() - 6)

  const dataStale =
    isCurrentContext && startOfDay(latestDataDate).getTime() < today.getTime()

  return {
    start,
    end: anchorEnd,
    key: isoDate(start),
    label: weekLabel(start, anchorEnd),
    latestDataDate,
    dataStale,
  }
}

function inWindow(log: PlayerGameLog, window: WeeklyWindow): boolean {
  const d = parseDate(log.date)
  if (!d) return false
  return d >= window.start && d <= window.end
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function createWeeklyPlayerSnapshot(base: Player, logs: PlayerGameLog[]): Player {
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
    const logs = (player.gameLog ?? []).filter((g) => inWindow(g, window))
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
      const peerGame = (peer.gameLog ?? []).find((g) => g.date === log.date)
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
      const peerGame = (fallback.gameLog ?? []).find((g) => g.date === log.date)
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
    const hit = (candidate.gameLog ?? []).find((g) => g.date === log.date)
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
      avg(roleCohort.map((c) => Number(c[def.key] ?? 0))) || 0
    const val = Number(player.weekly[def.key] ?? 0)
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

function championOfWeekFromLogs(
  weeklyPlayers: WeeklyPlayer[],
  allChamps: Champion[],
  weekKey: string,
): Champion[] {
  const src = new Map(allChamps.map((c) => [c.name, c]))
  const map = new Map<string, Champion>()

  const uniqueMatches = new Set<string>()
  for (const wp of weeklyPlayers) {
    for (const g of wp.weeklyGames) {
      uniqueMatches.add(`${wp.base.team}|${g.date}|${g.opponent}`)
      const k = g.champion
      if (!k) continue
      const base = src.get(k)
      const ex =
        map.get(k) ??
        ({
          name: k,
          positions: base?.positions ?? [wp.role],
          picks: 0,
          bans: 0,
          presence: 0,
          pickRate: 0,
          banRate: 0,
          winrate: 0,
          avgKda: 0,
          games: 0,
          wins: 0,
        } as Champion)
      ex.picks += 1
      ex.games = ex.picks
      ex.avgKda += g.kda
      ex.wins = (ex.wins ?? 0) + (g.result === 1 ? 1 : 0)
      map.set(k, ex)
    }
  }

  const totalGames = Math.max(uniqueMatches.size / 2, 1)
  return [...map.values()]
    .map((c) => {
      const base = src.get(c.name)
      const weekly = base?.weeklyStats?.find((w) => w.weekStart === weekKey)
      const picks = c.picks
      const bans = weekly?.bans ?? 0
      const pickRate = (picks / totalGames) * 100
      const banRate = (bans / totalGames) * 100
      return {
        ...c,
        bans,
        pickRate,
        banRate,
        presence: pickRate + banRate,
        avgKda: c.avgKda / Math.max(picks, 1),
        winrate: ((c.wins ?? 0) / Math.max(picks, 1)) * 100,
      }
    })
    .filter((c) => c.picks >= 2)
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
    <div className="overview-weekly-radar">
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
    </div>
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

  const playerOfWeek = useMemo(
    () => [...weeklyPlayers].sort((a, b) => b.scoreAvg - a.scoreAvg)[0] ?? null,
    [weeklyPlayers],
  )

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

  const championsOfWeek = useMemo(
    () =>
      weeklyWindow
        ? championOfWeekFromLogs(weeklyPlayers, filteredChampions, weeklyWindow.key)
        : [],
    [weeklyPlayers, filteredChampions, weeklyWindow],
  )
  const opResult = useMemo(() => computeOpScores(championsOfWeek), [championsOfWeek])

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
            ? ` · Data through ${weeklyWindow.latestDataDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : ''}
          {lastUpdated
            ? ` · Refreshed ${lastUpdated.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </p>
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Player of the Week</h2>
        {!playerOfWeek ? (
          <p className="text-secondary">No weekly game log data for this filter.</p>
        ) : (
          <>
            <div className="overview-weekly-head">
              <div>
                <div className="overview-weekly-name">{playerOfWeek.base.name}</div>
                <div className="overview-weekly-meta">
                  {playerOfWeek.base.team} · {playerOfWeek.role.toUpperCase()} ·{' '}
                  {formatNum(playerOfWeek.scoreAvg * 100, 1)} avg performance score
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
            <WeeklyRadar
              player={playerOfWeek.weekly}
              role={playerOfWeek.role}
              cohort={weeklyPlayers.filter((p) => p.role === playerOfWeek.role).map((p) => p.weekly)}
            />
            <div className="overview-best-games">
              <h3 className="card-title">Top 3 games this week (by KDA)</h3>
              <ul>
                {[...playerOfWeek.weeklyGames]
                  .sort((a, b) => b.kda - a.kda)
                  .slice(0, 3)
                  .map((g, idx) => {
                    const opp = opponentLaneInfo(
                      filteredPlayers,
                      playerOfWeek.base.team,
                      playerOfWeek.role,
                      g,
                    )
                    return (
                      <li key={`${g.date}-${idx}`} className="overview-best-game-row">
                        <span className="text-accent">
                          #{idx + 1} · {g.date}
                        </span>
                        <span>
                          {g.champion} · {formatNum(g.kda, 2)} KDA
                        </span>
                        <span className="text-secondary">
                          vs {opp.team} / {opp.player} / {opp.champion}
                        </span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Team of the Week (Best 5 by role)</h2>
        <div className="overview-totw-grid">
          {teamOfWeek.map((p) => {
            const best = [...p.weeklyGames].sort((a, b) => b.kda - a.kda)[0]
            const opp = best
              ? opponentLaneInfo(filteredPlayers, p.base.team, p.role, best)
              : null
            return (
              <article key={`${p.base.name}-${p.role}`} className="overview-totw-card">
                <div className="overview-weekly-name">{p.base.name}</div>
                <div className="overview-weekly-meta">
                  {p.base.team} · {p.role.toUpperCase()}
                </div>
                <WeeklyRadar
                  player={p.weekly}
                  role={p.role}
                  cohort={weeklyPlayers.filter((row) => row.role === p.role).map((row) => row.weekly)}
                  compact
                />
                {best && (
                  <div className="overview-mini-meta text-secondary">
                    Best game: {best.champion} · {formatNum(best.kda, 2)} KDA · vs {opp?.team ?? 'N/A'} /{' '}
                    {opp?.player ?? 'N/A'} / {opp?.champion ?? 'N/A'}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="card overview-hub-card">
        <h2 className="card-title">Hottest Team 🔥</h2>
        {!hottestTeam ? (
          <p className="text-secondary">Not enough weekly team data.</p>
        ) : (
          <div className="overview-hottest-layout">
            <div className="overview-hottest-grid">
              <div className="overview-weekly-name">{hottestTeam.team}</div>
              <div className="overview-weekly-meta">
                Team Score:{' '}
                <span className="text-accent">{formatNum(hottestTeam.impressiveness, 1)}</span>
              </div>
              <div className="overview-hottest-stats">
                <div>Weekly WR: {formatPct(hottestTeam.weeklyWinrate, 1)}</div>
                <div>Weekly avg KDA: {formatNum(hottestTeam.weeklyAvgKda, 2)}</div>
                <div>Weekly avg GD@15: {formatNum(hottestTeam.weeklyAvgGd15, 1)}</div>
                <div>Weekly avg Obj Control: {formatNum(hottestTeam.weeklyObjControl, 2)}</div>
                <div>Opponent split WR avg: {formatPct(hottestTeam.avgOpponentSplitWinrate, 1)}</div>
                <div>Upset wins bonus: {hottestTeam.upsetWins}</div>
              </div>
              <p className="text-secondary overview-method-note">
                Method blends team weekly performance (winrate, KDA, GD@15, objective control) with
                strength-of-schedule (average opponent split winrate) plus upset-win bonus.
              </p>
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
        {!opResult.top ? (
          <p className="text-secondary">No champion weekly sample for this filter.</p>
        ) : (
          <div className="overview-champion-week">
            <div className="overview-weekly-name">{opResult.top.champion.name}</div>
            <div className="overview-weekly-meta">
              Role: {opResult.top.role.toUpperCase()} · Presence:{' '}
              {formatPct(opResult.top.champion.presence, 1)} · Winrate:{' '}
              {formatPct(opResult.top.champion.winrate, 1)}
            </div>
            <div className="overview-opscore-row">
              <span
                className="overview-opscore-label"
                title="OP Score = average z-score across presence, winrate, ban rate, and average KDA within role."
              >
                OP Score ⓘ
              </span>
              <span className="overview-opscore-value">{formatNum(opResult.top.opScore, 2)}</span>
            </div>
            <div className="overview-hottest-stats">
              <div>Presence: {formatPct(opResult.top.champion.presence, 1)}</div>
              <div>Winrate: {formatPct(opResult.top.champion.winrate, 1)}</div>
              <div>Ban rate: {formatPct(opResult.top.champion.banRate, 1)}</div>
              <div>Avg KDA: {formatNum(opResult.top.champion.avgKda, 2)}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
