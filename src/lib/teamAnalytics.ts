import type { Team } from '../hooks/useDashboardData'
import { TIER1_LEAGUES } from './mergeSlices'

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

const warnedMissing = new Set<string>()

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

function getRawMetric(team: Team, key: TeamRadarMetricKey): number {
  switch (key) {
    case 'earlyGame':
      return team.avgGd15 ?? 0
    case 'objControl':
      return team.objPerGame ?? 0
    case 'economy':
      return team.goldPerMin ?? 0
    case 'vision':
      return team.wardsPerMin ?? 0
    case 'combat':
      return team.avgKda ?? 0
    default:
      return 0
  }
}

function warnMissing(field: string) {
  if (!warnedMissing.has(field)) {
    console.warn(`[Teams] Missing stat "${field}" in team data; treating as 0`)
    warnedMissing.add(field)
  }
}

export function getTeamRadarRaw(team: Team, key: TeamRadarMetricKey): number {
  const value = getRawMetric(team, key)
  if (value === 0) {
    const field =
      key === 'earlyGame'
        ? 'avgGd15'
        : key === 'objControl'
          ? 'objPerGame'
          : key === 'economy'
            ? 'goldPerMin'
            : key === 'vision'
              ? 'wardsPerMin'
              : 'avgKda'
    const hasField = team[field as keyof Team] !== undefined && team[field as keyof Team] !== null
    if (!hasField) warnMissing(field)
  }
  return value
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
      return `${value > 0 ? '+' : ''}${value.toFixed(1)} GD@15`
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
    const cohortValues = cohort.map((t) => getTeamRadarRaw(t, def.key))
    const raw = getTeamRadarRaw(team, def.key)
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : 0
    return {
      metric: def.shortLabel,
      label: def.label,
      valueNorm: normalizeInCohort(raw, cohortValues),
      avgNorm: normalizeInCohort(avgRaw, cohortValues),
      raw,
      avgRaw,
      formatted: formatRadarRaw(def.key, raw),
      formattedAvg: formatRadarRaw(def.key, avgRaw),
    }
  })
}

export function buildComparisonRadarData(
  teams: Team[],
  cohort: Team[],
): TeamRadarSeriesPoint[] {
  return TEAM_RADAR_METRICS.map((def) => {
    const cohortValues = cohort.map((t) => getTeamRadarRaw(t, def.key))
    const avgRaw = cohortValues.length
      ? cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length
      : 0
    const base: TeamRadarSeriesPoint = {
      metric: def.shortLabel,
      label: def.label,
      valueNorm: 0,
      avgNorm: normalizeInCohort(avgRaw, cohortValues),
      raw: 0,
      avgRaw,
      formatted: '',
      formattedAvg: formatRadarRaw(def.key, avgRaw),
    }
    teams.forEach((team, index) => {
      const raw = getTeamRadarRaw(team, def.key)
      base[`team${index}Norm`] = normalizeInCohort(raw, cohortValues)
      base[`team${index}Raw`] = raw
      base[`team${index}Label`] = formatRadarRaw(def.key, raw)
    })
    return base
  })
}

export function computeTeamScore(team: Team, cohort: Team[]): number {
  const weights: Record<TeamRadarMetricKey, number> = {
    earlyGame: 0.2,
    objControl: 0.2,
    economy: 0.2,
    vision: 0.15,
    combat: 0.25,
  }
  let total = 0
  for (const def of TEAM_RADAR_METRICS) {
    const cohortValues = cohort.map((t) => getTeamRadarRaw(t, def.key))
    const norm = normalizeInCohort(getTeamRadarRaw(team, def.key), cohortValues) / 100
    total += norm * weights[def.key]
  }
  return total
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
