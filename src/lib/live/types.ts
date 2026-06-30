/**
 * Normalized live-match model for the nucky.gg Live Match Hub.
 *
 * The UI renders only from these types. Raw CitoAPI response shapes are mapped
 * into these by `liveAdapters.ts`, so changing the upstream provider only
 * touches the adapter layer.
 */

export type LeagueFilter = 'ALL' | 'LCK' | 'LPL' | 'LEC' | 'LCS'

export type LiveState = 'live' | 'upcoming' | 'completed'

export type TeamSide = 'blue' | 'red'

export interface LiveTeamRef {
  slug: string
  name: string
  code: string | null
  logoUrl: string | null
  /** Series score (games won), when known. */
  score: number | null
}

/** A row in the Live hub list (live now or confirmed upcoming). */
export interface LiveMatchSummary {
  matchId: string
  /** Display league name, e.g. "LCK", "MSI". */
  league: string
  leagueSlug: string | null
  tournamentName: string | null
  blockName: string | null
  bestOf: number | null
  /** ISO start time, when scheduled. */
  startTime: string | null
  state: LiveState
  team1: LiveTeamRef
  team2: LiveTeamRef
  currentGameId: string | null
  currentGameNumber: number | null
  /** True when Cito reports in-game numeric stats are available. */
  statsAvailable: boolean
}

export interface LiveGameTeamStats {
  slug: string
  name: string
  shortName: string | null
  logoUrl: string | null
  side: TeamSide
  kills: number | null
  gold: number | null
  towers: number | null
  dragons: number | null
  barons: number | null
  heralds: number | null
  inhibitors: number | null
}

export interface LiveGameSummary {
  gameId: string
  gameNumber: number | null
  blue: LiveGameTeamStats | null
  red: LiveGameTeamStats | null
  winnerSlug: string | null
  /** Final/known duration in seconds, when available. */
  durationSeconds: number | null
  /** Elapsed in-game clock in seconds for a live game, when available. */
  gameClockSeconds: number | null
}

export interface LivePlayerRow {
  side: TeamSide
  role: string | null
  name: string
  championName: string | null
  level: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  cs: number | null
  gold: number | null
  /** Item ids (Data Dragon) currently held; trinket last if present. */
  items: number[]
  // Extended (revealed on expand) — any may be null when not provided live.
  goldPerMin: number | null
  csPerMin: number | null
  gd15: number | null
  csd15: number | null
  xpd15: number | null
  platesTaken: number | null
  damageToChampions: number | null
  damageToTurrets: number | null
  damageToObjectives: number | null
  visionScore: number | null
}

export interface LiveDraftPick {
  championName: string
  role: string | null
}

export interface LiveDraftTeam {
  side: TeamSide
  teamSlug: string | null
  bans: string[]
  picks: LiveDraftPick[]
}

export interface LiveMatchDraft {
  gameId: string | null
  gameNumber: number | null
  blue: LiveDraftTeam
  red: LiveDraftTeam
  hasData: boolean
}

export interface LiveMatchRoom {
  summary: LiveMatchSummary
  games: LiveGameSummary[]
  currentGame: LiveGameSummary | null
  /** Player rows for the current game (both teams), grouped blue then red. */
  players: LivePlayerRow[]
  draft: LiveMatchDraft | null
  /** True when live in-game player stats are flowing. */
  statsAvailable: boolean
  /** Honest status note when live data isn't ready (never names a data source). */
  notice: string | null
  updatedAt: string
}
