import type { Player, PlayerGameLog } from '../hooks/useDashboardData'
import { resolveGameOpponent } from './gameOpponent'
import { resolveLaneOpponentForGame } from './playerAnalytics'
import { normalizePosition, type RoleKey } from './playerRadar'
import { buildTournamentIdentityFromGame } from './tournamentCatalog'
import { formatPatch } from './format'
import { sideCellClass } from './entities/entityAnalytics'
import { buildGameToSeriesMap } from './seriesAnalytics'
import type { DashboardData } from '../hooks/useDashboardData'

export interface ChampionMatchHistoryRow {
  date: string
  result: 'W' | 'L'
  playerName: string
  playerTeam: string
  role: RoleKey | string
  kills: number
  deaths: number
  assists: number
  kda: number
  csd15: number | null
  opponentTeam: string | null
  opponentPlayer: string | null
  opponentChampion: string | null
  side: string
  sideClass: string
  patch: string
  tournament: string
  tournamentId: string
  tournamentLeague: string
  gameId: string
  seriesId: string | null
  /** 1-based game index within the series, when known. */
  seriesGameNumber: number | null
}

function resolveOpponentChampion(
  gameId: string,
  opponentPlayerName: string | null,
  allPlayers: Player[],
): string | null {
  if (!gameId || !opponentPlayerName) return null
  const opp = allPlayers.find((p) => p.name.toLowerCase() === opponentPlayerName.toLowerCase())
  if (!opp) return null
  const g = opp.gameLog?.find((x) => x.gameId === gameId)
  return g?.champion?.trim() || null
}

/**
 * Build per-game match history for a champion from OE player game logs
 * (respects whatever player slice the caller passes — league/year/split filtered).
 */
export function buildChampionMatchHistory(
  players: Player[],
  championName: string,
  opts?: {
    limit?: number
    gameCatalog?: DashboardData['gameCatalog']
    data?: DashboardData | null
  },
): ChampionMatchHistoryRow[] {
  const target = championName.toLowerCase()
  const gameToSeries = opts?.data ? buildGameToSeriesMap(opts.data) : new Map<string, string>()
  const seriesGameIndex = new Map<string, number>()

  // Precompute game order within each series (by date then gameId).
  if (opts?.data) {
    const bySeries = new Map<string, string[]>()
    for (const [gid, sid] of gameToSeries) {
      const list = bySeries.get(sid) ?? []
      list.push(gid)
      bySeries.set(sid, list)
    }
    for (const [sid, gids] of bySeries) {
      const dated = gids
        .map((gid) => {
          let date = ''
          for (const p of players) {
            const g = p.gameLog?.find((x) => x.gameId === gid)
            if (g?.date) {
              date = g.date
              break
            }
          }
          return { gid, date }
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.gid.localeCompare(b.gid))
      dated.forEach((row, i) => {
        seriesGameIndex.set(`${sid}|${row.gid}`, i + 1)
      })
      void sid
    }
  }

  const rows: ChampionMatchHistoryRow[] = []

  for (const player of players) {
    for (const game of player.gameLog ?? []) {
      if ((game.champion ?? '').toLowerCase() !== target) continue
      const opponentTeam = resolveGameOpponent(
        game,
        player.team,
        players,
        opts?.gameCatalog,
      )
      const gameWithOpp: PlayerGameLog = opponentTeam ? { ...game, opponent: opponentTeam } : game
      const opponentPlayer = resolveLaneOpponentForGame(gameWithOpp, player, players)
      const opponentChampion = resolveOpponentChampion(game.gameId ?? '', opponentPlayer, players)
      const role = normalizePosition(player.position) ?? player.position
      const sideRaw = (game.side ?? '').toLowerCase()
      const side = sideRaw ? sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1) : '—'
      const tournamentIdentity = buildTournamentIdentityFromGame(game)
      const seriesId = game.gameId ? gameToSeries.get(game.gameId) ?? null : null
      const seriesGameNumber =
        seriesId && game.gameId ? seriesGameIndex.get(`${seriesId}|${game.gameId}`) ?? null : null
      const patch =
        game.gameId && opts?.gameCatalog?.[game.gameId]?.patch?.trim()
          ? formatPatch(opts.gameCatalog[game.gameId]!.patch!.trim())
          : '—'

      rows.push({
        date: game.date,
        result: game.result === 1 ? 'W' : 'L',
        playerName: player.name,
        playerTeam: player.team,
        role,
        kills: game.kills ?? 0,
        deaths: game.deaths ?? 0,
        assists: game.assists ?? 0,
        kda: game.kda,
        csd15: typeof game.csd15 === 'number' ? game.csd15 : null,
        opponentTeam,
        opponentPlayer,
        opponentChampion,
        side,
        sideClass: sideCellClass(game.side),
        patch,
        tournament: tournamentIdentity.displayName,
        tournamentId: tournamentIdentity.id,
        tournamentLeague: tournamentIdentity.league,
        gameId: game.gameId ?? '',
        seriesId,
        seriesGameNumber,
      })
    }
  }

  rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.gameId.localeCompare(a.gameId)
  })

  return opts?.limit != null ? rows.slice(0, opts.limit) : rows
}
