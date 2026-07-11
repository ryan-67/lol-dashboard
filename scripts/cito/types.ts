export interface CitoLeague {
  leagueId?: string
  id?: string
  slug?: string
  name?: string
}

export interface CitoScheduleTeam {
  name?: string
  code?: string
  shortName?: string
  slug?: string
  score?: number
  outcome?: string
  imageUrl?: string
}

export interface CitoScheduleEvent {
  matchId: string
  startTime?: string
  state?: string
  blockName?: string
  teams?: CitoScheduleTeam[]
  strategy?: { type?: string; count?: number }
  leagueId?: string
  leagueName?: string
}

export interface CitoMatchSummary {
  matchId: string
  esportsApiId?: string
  state?: string
  startTime?: string
  endTime?: string | null
  strategy?: string | { type?: string; count?: number }
  gameCount?: number
  teams?: Array<{
    slug?: string
    name?: string
    shortName?: string
    score?: number
    outcome?: string
  }>
  tournament?: {
    league?: { slug?: string; name?: string; leagueId?: string }
  }
}

export interface CitoGameSummary {
  gameId: string
  esportsApiId?: string
  matchId?: string
  gameNumber?: number
  patch?: string | null
  duration?: number | null
  winnerSlug?: string | null
  winningSide?: string | null
  blueTeam?: {
    slug?: string
    name?: string
    shortName?: string
    kills?: number
    gold?: number
    towers?: number
    dragons?: number
    barons?: number
  }
  redTeam?: CitoGameSummary['blueTeam']
}

export interface CitoGoldPoint {
  timestamp?: number
  minute?: number
  blueGold?: number
  redGold?: number
  goldDiff?: number
}

export interface CitoPostgamePayload {
  gameId?: string
  source?: string
  goldGraph?: CitoGoldPoint[]
  timeline?: unknown
  plates?: unknown
  goldDistribution?: unknown
  damageDistribution?: unknown
  vision?: unknown
  jungleShare?: unknown
  rawAdvancedStats?: Record<string, unknown>
  lastUpdated?: string
}

export interface StoredGoldPoint {
  minute: number
  goldDiffBlue: number
}

export interface CitoObjectiveEvent {
  minute: number
  objectiveType: string
  side: string
  eventType?: string
  playerName?: string
}

export interface CitoGameGoldRow {
  cito_game_id: string
  oe_game_id: string | null
  cito_match_id: string | null
  league: string | null
  game_date: string
  game_number: number | null
  blue_team: string | null
  red_team: string | null
  blue_slug: string | null
  red_slug: string | null
  gold_timeline: StoredGoldPoint[]
  objectives_timeline?: CitoObjectiveEvent[] | null
  duration_minutes: number | null
  fetched_at: string
}

export interface OeGameRecord {
  gameId: string
  date: string
  league: string
  team: string
  opponent: string
  result: number
  kills?: number
  deaths?: number
  assists?: number
  gd15?: number
  gameLength?: number
  split?: string
}

export interface LinkageCandidate {
  oeGameId: string
  citoGameId: string
  citoMatchId: string
  league: string
  gameDate: string
  teamA: string
  teamB: string
  gameNumber: number
  matchMethod: string
  confidence: number
  notes?: string
}

export interface EndpointProbeResult {
  endpoint: string
  status: 'ok' | 'empty' | 'error'
  httpStatus?: number
  payloadKeys?: string[]
  pointCount?: number
  message?: string
}

export interface Phase0Report {
  generatedAt: string
  phase: '0'
  apiKeyConfigured: boolean
  supabaseConfigured: boolean
  leagues: Array<{
    leagueId: string
    name: string
    completedMatchesSampled: number
    endpointProbes: EndpointProbeResult[]
    linkageAttempts: number
    linkageMatched: number
  }>
  linkage: LinkageCandidate[]
  parity: Array<{
    oeGameId: string
    citoGameId: string
    checks: Array<{ metric: string; oe: number | null; cito: number | null; delta: number | null; ok: boolean }>
  }>
  summary: {
    endpointSuccessRate: number
    linkageRate: number
    parityPassRate: number
    readyForPhase1: boolean
    blockers: string[]
  }
}
