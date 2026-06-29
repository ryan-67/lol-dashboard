import type { Player, PlayerGameLog, GameCatalogEntry } from '../hooks/useDashboardData'
import { teamMatchesCanonical } from './entities/slugs'

function catalogOpponent(
  game: PlayerGameLog,
  playerTeam: string,
  gameCatalog?: Record<string, GameCatalogEntry>,
): string {
  if (!game.gameId || !gameCatalog?.[game.gameId]?.teams) return ''
  const teams = Object.keys(gameCatalog[game.gameId]!.teams)
  return teams.find((t) => !teamMatchesCanonical(t, playerTeam)) ?? ''
}

function rosterOpponent(
  game: PlayerGameLog,
  playerTeam: string,
  players: Player[],
): string {
  if (!game.gameId) return ''
  for (const p of players) {
    if (teamMatchesCanonical(p.team, playerTeam)) continue
    if ((p.gameLog ?? []).some((pg) => pg.gameId === game.gameId)) return p.team
  }
  return ''
}

/** Resolve opposing team for a game log row (catalog → roster → validated stored). */
export function resolveGameOpponent(
  game: PlayerGameLog,
  playerTeam: string,
  players: Player[],
  gameCatalog?: Record<string, GameCatalogEntry>,
): string {
  const fromCatalog = catalogOpponent(game, playerTeam, gameCatalog)
  const fromRoster = rosterOpponent(game, playerTeam, players)
  const stored = game.opponent?.trim() ?? ''

  const catalogTeams =
    game.gameId && gameCatalog?.[game.gameId]?.teams
      ? Object.keys(gameCatalog[game.gameId]!.teams)
      : []

  const storedMatchesCatalog =
    !catalogTeams.length || catalogTeams.some((t) => teamMatchesCanonical(t, stored))
  const storedMatchesInference =
    (!fromCatalog || teamMatchesCanonical(stored, fromCatalog)) &&
    (!fromRoster || teamMatchesCanonical(stored, fromRoster))

  if (fromCatalog) return fromCatalog
  if (fromRoster) return fromRoster
  if (stored && storedMatchesCatalog && storedMatchesInference) return stored
  if (catalogTeams.length >= 2) {
    const fixed = catalogTeams.find((t) => !teamMatchesCanonical(t, playerTeam))
    if (fixed) return fixed
  }
  return stored
}
