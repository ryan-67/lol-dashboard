import type { Team } from '../hooks/useDashboardData'
import { TIER1_LEAGUES } from './mergeSlices'
import type { Player } from '../hooks/useDashboardData'
import { isTeamMetricEligibleForScore } from './teamStatAvailability'

export type TeamScope = 'top' | 'all'

export const TEAM_RADAR_METRICS = [
  { key: 'earlyGame', label: 'Early Game', shortLabel: 'EG' },
  { key: 'objControl', label: 'Objective Control', shortLabel: 'Obj' },
  { key: 'economy', label: 'Economy', shortLabel: 'Econ' },
  { key: 'vision', label: 'Vision', shortLabel: 'Vis' },
  { key: 'combat', label: 'Combat', shortLabel: 'KDA' },
] as const

export type TeamRadarMetricKey = (typeof TEAM_RADAR_METRICS)[number]['key']

/** League colors for scatter dots (not UI chrome) */
export const LEAGUE_COLORS: Record<string, string> = {
  LCK: '#c5a059',
  LPL: '#c45c5c',
  LEC: '#5c7a9e',
  LCS: '#5c9e5a',
  MSI: '#9e8c7a',
  WLDs: '#8c6a9e',
  FST: '#6a7a8c',
}

const warnedMissing = new Set<string>() // reserved for dev diagnostics
void warnedMissing

type EarlyGameComponentKey =
  | 'avgGd15'
  | 'avgCsd15'
  | 'avgXpd15'
  | 'firstBloodRate'
  | 'avgKaAt15'
  | 'firstBloodVictimRate'

const EARLY_GAME_COMPONENTS: { key: EarlyGameComponentKey; invert: boolean }[] = [
  { key: 'avgGd15', invert: false },
  { key: 'avgCsd15', invert: false },
  { key: 'avgXpd15', invert: false },
  { key: 'firstBloodRate', invert: false },
  { key: 'avgKaAt15', invert: false },
  { key: 'firstBloodVictimRate', invert: true },
]

function getEarlyGameComponentRaw(team: Team, key: EarlyGameComponentKey): number | null {
  const value = team[key]
  return typeof value === 'number' && !Number.isNaN(value) ? value : null
}

function scoreEarlyGameComponent(
  team: Team,
  cohort: Team[],
  key: EarlyGameComponentKey,
  invert: boolean,
): number | null {
  const raw = getEarlyGameComponentRaw(team, key)
  if (raw == null) return null
  const value = invert ? 100 - raw : raw
  const cohortValues = cohort
    .map((t) => {
      const v = getEarlyGameComponentRaw(t, key)
      if (v == null) return null
      return invert ? 100 - v : v
    })
    .filter((v): v is number => v != null)
  if (!cohortValues.length) return null
  return normalizeInCohort(value, cohortValues)
}

/** Cohort-normalized early game score (0–100) from six @15 / FB sub-metrics. */
export function computeTeamEarlyGameComposite(team: Team, cohort: Team[]): number | null {
  let total = 0
  let count = 0
  for (const { key, invert } of EARLY_GAME_COMPONENTS) {
    const norm = scoreEarlyGameComponent(team, cohort, key, invert)
    if (norm == null) continue
    total += norm
    count += 1
  }
  return count > 0 ? total / count : null
}

/** Highlight stat where team is farthest above cohort average on radar metrics. */
export function highestTeamRadarHighlight(
  team: Team,
  cohort: Team[],
): { label: string; formatted: string; delta: number } | null {
  let best: { label: string; formatted: string; delta: number } | null = null
  for (const def of TEAM_RADAR_METRICS) {
    const cohortValues = cohort
      .map((t) => getTeamRadarRaw(t, def.key, cohort))
      .filter((v): v is number => v != null)
    const raw = getTeamRadarRaw(team, def.key, cohort)
    if (raw == null || !cohortValues.length) continue
    const avg = cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
    const delta = raw - avg
    if (!best || delta > best.delta) {
      best = {
        label: def.label,
        formatted: formatRadarRawOrMissing(def.key, raw),
        delta,
      }
    }
  }
  return best
}

export function teamKey(team: Team): string {
  return `${team.name}|${team.league}`
}

export function parseTeamKey(key: string): { name: string; league: string } {
  const [name, league] = key.split('|')
  return { name: name ?? '', league: league ?? '' }
}

export function isDisplayableTeam(t: Team): boolean {
  return (
    Boolean(t?.name) &&
    typeof t.wins === 'number' &&
    typeof t.losses === 'number' &&
    !Array.isArray((t as Team & { positions?: unknown }).positions)
  )
}

function getRawMetric(
  team: Team,
  key: TeamRadarMetricKey,
  cohort?: Team[],
): number | null {
  switch (key) {
    case 'earlyGame':
      if (cohort?.length) {
        return computeTeamEarlyGameComposite(team, cohort)
      }
      return typeof team.avgGd15 === 'number' ? team.avgGd15 : null
    case 'objControl':
      return team.objPerGame ?? null
    case 'economy':
      return team.goldPerMin ?? null
    case 'vision':
      return team.wardsPerMin ?? null
    case 'combat':
      return team.avgKda ?? null
    default:
      return null
  }
}

export function getTeamRadarRaw(
  team: Team,
  key: TeamRadarMetricKey,
  cohort?: Team[],
): number | null {
  return getRawMetric(team, key, cohort)
}

export function formatRadarRawOrMissing(key: TeamRadarMetricKey, value: number | null): string {
  if (value == null) return '—'
  return formatRadarRaw(key, value)
}

function normalizeInCohort(value: number, cohortValues: number[]): number {
  if (!cohortValues.length) return 0
  const min = Math.min(...cohortValues)
  const max = Math.max(...cohortValues)
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

export function formatRadarRaw(key: TeamRadarMetricKey, value: number): string {
  switch (key) {
    case 'earlyGame':
      return `${value.toFixed(0)} EG score`
    case 'objControl':
      return `${value.toFixed(2)} obj/g`
    case 'economy':
      return `${value.toFixed(1)} gold/min`
    case 'vision':
      return `${value.toFixed(2)} wards/min`
    case 'combat':
      return value.toFixed(2) + ' KDA'
    default:
      return value.toFixed(2)
  }
}

export interface TeamTableStatColumn {
  key: keyof Team | TeamRadarMetricKey
  label: string
  sortKey: keyof Team | 'perfScore' | TeamRadarMetricKey
  format: (team: Team, cohort: Team[]) => string
}

/** Radar composites plus underlying team stats for rankings tables. */
export const TEAM_RANKINGS_STAT_COLUMNS: TeamTableStatColumn[] = [
  ...TEAM_RADAR_METRICS.map((def) => ({
    key: def.key as TeamRadarMetricKey,
    label: def.shortLabel,
    sortKey: def.key as TeamRadarMetricKey,
    format: (team: Team, cohort: Team[]) =>
      formatRadarRawOrMissing(def.key, getTeamRadarRaw(team, def.key, cohort)),
  })),
  {
    key: 'avgGd15',
    label: 'GD@15',
    sortKey: 'avgGd15',
    format: (team) =>
      typeof team.avgGd15 === 'number' ? `${team.avgGd15 > 0 ? '+' : ''}${team.avgGd15.toFixed(1)}` : '—',
  },
  {
    key: 'dragonsPerGame',
    label: 'Dragons/G',
    sortKey: 'dragonsPerGame',
    format: (team) => (typeof team.dragonsPerGame === 'number' ? team.dragonsPerGame.toFixed(2) : '—'),
  },
  {
    key: 'baronsPerGame',
    label: 'Barons/G',
    sortKey: 'baronsPerGame',
    format: (team) => (typeof team.baronsPerGame === 'number' ? team.baronsPerGame.toFixed(2) : '—'),
  },
  {
    key: 'towersPerGame',
    label: 'Towers/G',
    sortKey: 'towersPerGame',
    format: (team) => (typeof team.towersPerGame === 'number' ? team.towersPerGame.toFixed(2) : '—'),
  },
  {
    key: 'firstBloodRate',
    label: 'FB %',
    sortKey: 'firstBloodRate',
    format: (team) => (typeof team.firstBloodRate === 'number' ? `${team.firstBloodRate.toFixed(1)}%` : '—'),
  },
  {
    key: 'goldPerMin',
    label: 'Gold/min',
    sortKey: 'goldPerMin',
    format: (team) => (typeof team.goldPerMin === 'number' ? team.goldPerMin.toFixed(1) : '—'),
  },
  {
    key: 'wardsPerMin',
    label: 'Wards/min',
    sortKey: 'wardsPerMin',
    format: (team) => (typeof team.wardsPerMin === 'number' ? team.wardsPerMin.toFixed(2) : '—'),
  },
  {
    key: 'objPerGame',
    label: 'Obj/G',
    sortKey: 'objPerGame',
    format: (team) => (typeof team.objPerGame === 'number' ? team.objPerGame.toFixed(2) : '—'),
  },
  {
    key: 'avgKda',
    label: 'Team KDA',
    sortKey: 'avgKda',
    format: (team) => (typeof team.avgKda === 'number' ? team.avgKda.toFixed(2) : '—'),
  },
]

export interface TeamRadarPoint {
  metric: string
  earlyGame?: number
  objControl?: number
  economy?: number
  vision?: number
  combat?: number
  [key: string]: string | number | undefined
}

export interface TeamRadarSeriesPoint {
  metric: string
  label: string
  valueNorm: number
  avgNorm: number
  raw: number
  avgRaw: number
  formatted: string
  formattedAvg: string
  [key: string]: string | number | undefined
}

export function buildTeamRadarSeries(
  team: Team,
  cohort: Team[],
): TeamRadarSeriesPoint[] {
  return TEAM_RADAR_METRICS.map((def) => {
    const cohortValues = cohort
      .map((t) => getTeamRadarRaw(t, def.key, cohort))
      .filter((v): v is number => v != null)
    const raw = getTeamRadarRaw(team, def.key, cohort)
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : null
    return {
      metric: def.shortLabel,
      label: def.label,
      valueNorm: raw != null && cohortValues.length ? normalizeInCohort(raw, cohortValues) : 0,
      avgNorm: avgRaw != null && cohortValues.length ? normalizeInCohort(avgRaw, cohortValues) : 0,
      raw: raw ?? 0,
      avgRaw: avgRaw ?? 0,
      formatted: formatRadarRawOrMissing(def.key, raw),
      formattedAvg: formatRadarRawOrMissing(def.key, avgRaw),
    }
  })
}

export function buildComparisonRadarData(
  teams: Team[],
  cohort: Team[],
): TeamRadarSeriesPoint[] {
  return TEAM_RADAR_METRICS.map((def) => {
    const cohortValues = cohort
      .map((t) => getTeamRadarRaw(t, def.key, cohort))
      .filter((v): v is number => v != null)
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : null
    const base: TeamRadarSeriesPoint = {
      metric: def.shortLabel,
      label: def.label,
      valueNorm: 0,
      avgNorm: avgRaw != null && cohortValues.length ? normalizeInCohort(avgRaw, cohortValues) : 0,
      raw: 0,
      avgRaw: avgRaw ?? 0,
      formatted: '',
      formattedAvg: formatRadarRawOrMissing(def.key, avgRaw),
    }
    teams.forEach((team, index) => {
      const raw = getTeamRadarRaw(team, def.key, cohort)
      base[`team${index}Norm`] =
        raw != null && cohortValues.length ? normalizeInCohort(raw, cohortValues) : 0
      base[`team${index}Raw`] = raw ?? 0
      base[`team${index}Label`] = formatRadarRawOrMissing(def.key, raw)
    })
    return base
  })
}

export function computeTeamScore(team: Team, cohort: Team[], players: Player[] = []): number {
  const weights: Record<TeamRadarMetricKey, number> = {
    earlyGame: 0.2,
    objControl: 0.2,
    economy: 0.2,
    vision: 0.15,
    combat: 0.25,
  }
  let total = 0
  let weightSum = 0
  for (const def of TEAM_RADAR_METRICS) {
    if (players.length && !isTeamMetricEligibleForScore(team, def.key, players)) continue
    const cohortValues = cohort
      .map((t) => getTeamRadarRaw(t, def.key, cohort))
      .filter((v): v is number => v != null)
    const raw = getTeamRadarRaw(team, def.key, cohort)
    if (raw == null || !cohortValues.length) continue
    const norm = normalizeInCohort(raw, cohortValues) / 100
    total += norm * weights[def.key]
    weightSum += weights[def.key]
  }
  return weightSum > 0 ? total / weightSum : 0
}

export function rankTeams(teams: Team[], limit?: number): Team[] {
  const ranked = [...teams].sort(
    (a, b) => computeTeamScore(b, teams) - computeTeamScore(a, teams),
  )
  return limit ? ranked.slice(0, limit) : ranked
}

export function bestTeamPerLeague(teams: Team[]): Team[] {
  const byLeague = new Map<string, Team[]>()
  for (const team of teams) {
    const list = byLeague.get(team.league) ?? []
    list.push(team)
    byLeague.set(team.league, list)
  }
  return [...byLeague.values()]
    .map((leagueTeams) => rankTeams(leagueTeams, 1)[0])
    .filter((t): t is Team => Boolean(t))
    .sort((a, b) => a.league.localeCompare(b.league))
}

export function leagueColor(league: string): string {
  return LEAGUE_COLORS[league] ?? '#9e9a8e'
}

export function teamsForScope(teams: Team[], scope: TeamScope): Team[] {
  return scope === 'top' ? bestTeamPerLeague(teams) : teams
}

/** Teams to show in the main radar grid on the Teams tab. */
export function teamsForRadarDisplay(
  teams: Team[],
  scope: TeamScope,
  allTier1Selected: boolean,
): Team[] {
  if (scope === 'all') return teams
  if (allTier1Selected) return bestTeamPerTier1League(teams)
  return rankTeams(teams, 4)
}

export function defaultCompareKeys(teams: Team[], scope: TeamScope): string[] {
  return teamsForScope(teams, scope).map(teamKey)
}

export function bestTeamPerTier1League(teams: Team[]): Team[] {
  const tier1 = teams.filter((t) => (TIER1_LEAGUES as readonly string[]).includes(t.league))
  return bestTeamPerLeague(tier1)
}

export function findTeamByName(teams: Team[], name: string | null | undefined): Team | null {
  const trimmed = name?.trim()
  if (!trimmed) return null
  return (
    teams.find((t) => t.name === trimmed) ??
    teams.find((t) => t.name.toLowerCase() === trimmed.toLowerCase()) ??
    null
  )
}

export interface FavoriteCenterLayout {
  center: Team | null
  surrounding: Team[]
}

export function buildFavoriteCenterLayout(
  teams: Team[],
  favoriteName: string | null | undefined,
): FavoriteCenterLayout {
  return {
    center: findTeamByName(teams, favoriteName),
    surrounding: bestTeamPerTier1League(teams),
  }
}

const TIER1_SLOT_BY_LEAGUE: Record<string, 'top' | 'left' | 'right' | 'bottom'> = {
  LCK: 'top',
  LEC: 'left',
  LPL: 'right',
  LCS: 'bottom',
}

export function tier1LeagueSlot(league: string): 'top' | 'left' | 'right' | 'bottom' | null {
  return TIER1_SLOT_BY_LEAGUE[league] ?? null
}

/** Muted comparison palette — distinct from matte gold UI chrome */
export const COMPARISON_COLORS = [
  '#c45c5c',
  '#5c9e5a',
  '#5c7a9e',
  '#9e8c7a',
  '#8c6a9e',
  '#6a7a8c',
  '#7a8c5a',
  '#9e7a5c',
]
