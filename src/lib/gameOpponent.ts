import type { Player, PlayerGameLog, GameCatalogEntry } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'

/** Resolve opposing team for a game log row (catalog → roster → stored opponent). */
export function resolveGameOpponent(
  game: PlayerGameLog,
  playerTeam: string,
  players: Player[],
  gameCatalog?: Record<string, GameCatalogEntry>,
): string {
  const stored = game.opponent?.trim()
  if (stored) return stored

  if (game.gameId && gameCatalog?.[game.gameId]?.teams) {
    const teams = Object.keys(gameCatalog[game.gameId]!.teams)
    const other = teams.find((t) => !teamMatchesCanonical(t, playerTeam))
    if (other) return other
  }

  if (game.gameId) {
    for (const p of players) {
      if (teamMatchesCanonical(p.team, playerTeam)) continue
      if ((p.gameLog ?? []).some((pg) => pg.gameId === game.gameId)) return p.team
    }
  }

  return ''
}
