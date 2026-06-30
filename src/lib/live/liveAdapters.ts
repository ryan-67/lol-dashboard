import type {
  LiveDraftTeam,
  LiveGameSummary,
  LiveGameTeamStats,
  LiveMatchDraft,
  LiveMatchSummary,
  LivePlayerRow,
  LiveState,
  LiveTeamRef,
  TeamSide,
} from './types'

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null
}

function num(obj: unknown, ...keys: string[]): number | null {
  if (!isObj(obj)) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function str(obj: unknown, ...keys: string[]): string | null {
  if (!isObj(obj)) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

function arr(obj: unknown, ...keys: string[]): unknown[] {
  if (!isObj(obj)) return []
  for (const k of keys) {
    const v = obj[k]
    if (Array.isArray(v)) return v
  }
  return []
}

function normalizeHttps(url: string | null): string | null {
  if (!url) return null
  return url.startsWith('http://') ? url.replace(/^http:\/\//, 'https://') : url
}

function bestOfFrom(strategy: unknown): number | null {
  if (typeof strategy === 'number') return strategy
  if (typeof strategy === 'string') {
    const m = strategy.match(/(\d+)/)
    if (m) return Number(m[1])
  }
  if (isObj(strategy)) {
    const count = num(strategy, 'count')
    if (count != null) return count
  }
  return null
}

function stateFrom(raw: string | null): LiveState {
  const s = (raw ?? '').toLowerCase()
  if (s === 'inprogress' || s === 'in_game' || s === 'live' || s === 'paused') return 'live'
  if (s === 'completed' || s === 'finished' || s === 'resolved') return 'completed'
  return 'upcoming'
}

function teamRef(team: unknown): LiveTeamRef {
  return {
    slug: str(team, 'slug') ?? '',
    name: str(team, 'name', 'shortName', 'code') ?? 'TBD',
    code: str(team, 'code', 'shortName'),
    logoUrl: normalizeHttps(str(team, 'logoUrl', 'logo', 'image')),
    score: num(team, 'score', 'gameWins'),
  }
}

/** Adapt one `/lol/schedule/today|upcoming` event into a hub summary. */
export function adaptScheduleEvent(event: unknown): LiveMatchSummary | null {
  const matchId = str(event, 'matchId', 'id')
  if (!matchId) return null
  return {
    matchId,
    league: str(event, 'leagueName') ?? str(event, 'leagueSlug') ?? 'LoL',
    leagueSlug: str(event, 'leagueSlug', 'leagueId'),
    tournamentName: str(event, 'tournamentName', 'blockName'),
    blockName: str(event, 'blockName'),
    bestOf: bestOfFrom(isObj(event) ? event['strategy'] : null),
    startTime: str(event, 'startTime', 'scheduledAt'),
    state: stateFrom(str(event, 'state')),
    team1: teamRef(isObj(event) ? event['team1'] ?? (arr(event, 'teams')[0] as unknown) : null),
    team2: teamRef(isObj(event) ? event['team2'] ?? (arr(event, 'teams')[1] as unknown) : null),
    currentGameId: null,
    currentGameNumber: null,
    statsAvailable: false,
  }
}

/** A live-list overlay keyed by matchId, from `/lol/live` `data` entries. */
export interface LiveOverlay {
  matchId: string
  state: LiveState
  currentGameId: string | null
  statsAvailable: boolean
  blueScore: number | null
  redScore: number | null
}

export function adaptLiveOverlay(item: unknown): LiveOverlay | null {
  const matchId = str(item, 'matchId')
  if (!matchId) return null
  const score = isObj(item) ? item['score'] : null
  return {
    matchId,
    state: stateFrom(str(item, 'state') ?? 'live'),
    currentGameId: str(item, 'currentGameId', 'gameId'),
    statsAvailable: Boolean(isObj(item) && item['statsAvailable']),
    blueScore: num(score, 'blue'),
    redScore: num(score, 'red'),
  }
}

/** Extract the live-list array from a `/lol/live` payload (handles wrappers). */
export function extractLiveList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (isObj(payload)) {
    if (Array.isArray(payload['data']) && payload['data'].length) return payload['data']
    // Fall back to lastKnown only if it's flagged as currently live elsewhere.
    if (Array.isArray(payload['data'])) return payload['data']
  }
  return []
}

/** Extract a schedule array from a `/lol/schedule/*` payload. */
export function extractScheduleList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (isObj(payload) && Array.isArray(payload['data'])) return payload['data']
  return []
}

function teamStats(team: unknown, side: TeamSide): LiveGameTeamStats | null {
  if (!isObj(team)) return null
  return {
    slug: str(team, 'slug') ?? '',
    name: str(team, 'name', 'shortName') ?? 'TBD',
    shortName: str(team, 'shortName', 'code'),
    logoUrl: normalizeHttps(str(team, 'logoUrl')),
    side,
    kills: num(team, 'kills'),
    gold: num(team, 'gold', 'totalGold'),
    towers: num(team, 'towers'),
    dragons: num(team, 'dragons'),
    barons: num(team, 'barons'),
    heralds: num(team, 'heralds'),
    inhibitors: num(team, 'inhibitors'),
  }
}

/** Adapt `/lol/matches/{id}/games` into per-game summaries. */
export function adaptGames(payload: unknown): LiveGameSummary[] {
  const list = Array.isArray(payload)
    ? payload
    : isObj(payload) && Array.isArray(payload['data'])
      ? payload['data']
      : []
  return list
    .map((g): LiveGameSummary | null => {
      const gameId = str(g, 'gameId')
      if (!gameId) return null
      const duration = num(g, 'duration', 'durationSeconds')
      return {
        gameId,
        gameNumber: num(g, 'gameNumber'),
        blue: teamStats(isObj(g) ? g['blueTeam'] : null, 'blue'),
        red: teamStats(isObj(g) ? g['redTeam'] : null, 'red'),
        winnerSlug: str(g, 'winnerSlug'),
        durationSeconds: duration,
        gameClockSeconds: num(g, 'gameTime', 'gameClockSeconds'),
      }
    })
    .filter((g): g is LiveGameSummary => g != null)
}

function itemIds(player: unknown): number[] {
  const items = arr(player, 'items', 'itemIds')
  const ids: number[] = []
  for (const it of items) {
    if (typeof it === 'number' && it > 0) ids.push(it)
    else if (typeof it === 'string' && Number(it) > 0) ids.push(Number(it))
    else if (isObj(it)) {
      const id = num(it, 'itemId', 'id')
      if (id && id > 0) ids.push(id)
    }
  }
  return ids
}

function sideOf(player: unknown): TeamSide {
  const s = (str(player, 'side', 'team', 'teamSide') ?? '').toLowerCase()
  return s.includes('red') ? 'red' : 'blue'
}

function adaptPlayer(player: unknown, fallbackSide: TeamSide): LivePlayerRow {
  return {
    side: str(player, 'side', 'teamSide') ? sideOf(player) : fallbackSide,
    role: str(player, 'role', 'position'),
    name: str(player, 'summonerName', 'playerName', 'name', 'ign') ?? '—',
    championName: str(player, 'championName', 'champion', 'championId'),
    level: num(player, 'level', 'championLevel'),
    kills: num(player, 'kills'),
    deaths: num(player, 'deaths'),
    assists: num(player, 'assists'),
    cs: num(player, 'cs', 'creepScore', 'minionsKilled', 'totalCs'),
    gold: num(player, 'gold', 'totalGold', 'currentGold'),
    items: itemIds(player),
    goldPerMin: num(player, 'goldPerMin', 'gpm'),
    csPerMin: num(player, 'csPerMin', 'cspm'),
    gd15: num(player, 'gd15', 'goldDiff15', 'goldDiffAt15'),
    csd15: num(player, 'csd15', 'csDiff15', 'csDiffAt15'),
    xpd15: num(player, 'xpd15', 'xpDiff15', 'xpDiffAt15'),
    platesTaken: num(player, 'platesTaken', 'turretPlatesTaken', 'plates'),
    damageToChampions: num(player, 'damageToChampions', 'totalDamageDealtToChampions', 'damageDealtToChampions'),
    damageToTurrets: num(player, 'damageToTurrets', 'damageDealtToTurrets', 'totalDamageDealtToTurrets'),
    damageToObjectives: num(player, 'damageToObjectives', 'damageDealtToObjectives', 'totalDamageDealtToObjectives'),
    visionScore: num(player, 'visionScore', 'vision'),
  }
}

/**
 * Adapt a live player-stats payload into player rows. Handles several shapes:
 *  - `{ data: { blue: [...], red: [...] } }`
 *  - `{ data: [ { side, players: [...] } ] }`
 *  - `{ blueTeam: { participants }, redTeam: { participants } }` (live window)
 *  - flat `[ ...players ]`
 */
export function adaptPlayerStats(payload: unknown): LivePlayerRow[] {
  const rows: LivePlayerRow[] = []

  const data = isObj(payload) && 'data' in payload ? (payload as Obj)['data'] : payload

  // Shape: { blue: [...], red: [...] } or { blueTeam: {participants}, redTeam: {...} }
  if (isObj(data)) {
    const bluePlayers = arr(data, 'blue', 'blueTeam', 'bluePlayers')
    const redPlayers = arr(data, 'red', 'redTeam', 'redPlayers')
    if (bluePlayers.length || redPlayers.length) {
      for (const p of bluePlayers) rows.push(adaptPlayer(p, 'blue'))
      for (const p of redPlayers) rows.push(adaptPlayer(p, 'red'))
      if (rows.length) return rows
    }
    // window shape with nested participants
    const blueParticipants = arr(isObj(data) ? data['blueTeam'] : null, 'participants', 'players')
    const redParticipants = arr(isObj(data) ? data['redTeam'] : null, 'participants', 'players')
    if (blueParticipants.length || redParticipants.length) {
      for (const p of blueParticipants) rows.push(adaptPlayer(p, 'blue'))
      for (const p of redParticipants) rows.push(adaptPlayer(p, 'red'))
      if (rows.length) return rows
    }
  }

  // Shape: array of players, or array of { side, players }
  const list = Array.isArray(data) ? data : []
  for (const entry of list) {
    const nested = arr(entry, 'players', 'participants')
    if (nested.length) {
      const side = sideOf(entry)
      for (const p of nested) rows.push(adaptPlayer(p, side))
    } else if (isObj(entry)) {
      rows.push(adaptPlayer(entry, sideOf(entry)))
    }
  }
  return rows
}

function draftTeam(side: TeamSide, slug: string | null, bans: unknown[], picks: unknown[]): LiveDraftTeam {
  const toName = (v: unknown): string | null => {
    if (typeof v === 'string') return v
    if (isObj(v)) return str(v, 'championName', 'champion', 'name')
    return null
  }
  return {
    side,
    teamSlug: slug,
    bans: bans.map(toName).filter((v): v is string => Boolean(v)),
    picks: picks
      .map((p) => {
        const name = toName(p)
        if (!name) return null
        return { championName: name, role: isObj(p) ? str(p, 'role', 'position') : null }
      })
      .filter((p): p is { championName: string; role: string | null } => p != null),
  }
}

/** Adapt `/lol/analytics/drafts/{id}` into draft display. */
export function adaptDraft(payload: unknown): LiveMatchDraft | null {
  if (!isObj(payload)) return null
  const availability = payload['dataAvailability']
  const hasData = Boolean(isObj(availability) && availability['hasDraft'])
  return {
    gameId: str(payload, 'gameId'),
    gameNumber: num(payload, 'gameNumber'),
    blue: draftTeam('blue', str(payload, 'blueTeam'), arr(payload, 'blueBans'), arr(payload, 'bluePicks')),
    red: draftTeam('red', str(payload, 'redTeam'), arr(payload, 'redBans'), arr(payload, 'redPicks')),
    hasData,
  }
}

/** Adapt `/lol/matches/{id}` detail to override summary team/score/state. */
export function adaptMatchDetail(payload: unknown): Partial<LiveMatchSummary> | null {
  if (!isObj(payload)) return null
  const matchId = str(payload, 'matchId', 'id')
  if (!matchId) return null
  return {
    matchId,
    bestOf: bestOfFrom(payload['strategy']) ?? null,
    startTime: str(payload, 'startTime'),
    state: stateFrom(str(payload, 'state')),
    team1: teamRef(payload['team1']),
    team2: teamRef(payload['team2']),
    currentGameNumber: num(payload, 'gameCount'),
  }
}
