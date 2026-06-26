import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { OeGameRecord } from './types.ts'
import { resolveTeamCanonicalName } from '../../src/lib/entities/slugs.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function loadOeGamesFromShard(year = '2026'): OeGameRecord[] {
  const shardPath = path.join(ROOT, 'public', 'data', `oe_slices_${year}.json`)
  if (!existsSync(shardPath)) {
    throw new Error(`Missing OE shard ${shardPath}. Run ingest first.`)
  }

  const store = JSON.parse(readFileSync(shardPath, 'utf8')) as {
    slices: Record<string, { players?: Array<{ name: string; team: string; league: string; gameLog?: OeGameRecord[] }> }>
  }

  const seen = new Set<string>()
  const games: OeGameRecord[] = []

  for (const slice of Object.values(store.slices)) {
    for (const player of slice.players ?? []) {
      for (const log of player.gameLog ?? []) {
        const gameId = log.gameId
        if (!gameId || seen.has(`${player.team}|${gameId}`)) continue
        seen.add(`${player.team}|${gameId}`)

        games.push({
          gameId,
          date: log.date,
          league: log.league ?? player.league,
          team: resolveTeamCanonicalName(player.team),
          opponent: resolveTeamCanonicalName(log.opponent ?? ''),
          result: log.result,
          kills: log.kills,
          deaths: log.deaths,
          assists: log.assists,
          gd15: log.gd15,
          gameLength: log.gameLength,
          split: log.split,
        })
      }
    }
  }

  return games
}

export function uniqueOeGamesById(games: OeGameRecord[]): Map<string, OeGameRecord> {
  const map = new Map<string, OeGameRecord>()
  for (const game of games) {
    if (!map.has(game.gameId)) map.set(game.gameId, game)
  }
  return map
}

export function oeGamesForMatchup(
  games: OeGameRecord[],
  teamA: string,
  teamB: string,
  dateIso: string,
): OeGameRecord[] {
  const date = dateIso.slice(0, 10)
  const canonicalA = resolveTeamCanonicalName(teamA)
  const canonicalB = resolveTeamCanonicalName(teamB)

  const teamSet = new Set([canonicalA, canonicalB])
  const byGame = new Map<string, OeGameRecord>()

  for (const game of games) {
    if (game.date !== date) continue
    if (!teamSet.has(game.team) || !teamSet.has(game.opponent)) continue
    if (!byGame.has(game.gameId)) byGame.set(game.gameId, game)
  }

  return [...byGame.values()].sort((a, b) => a.gameId.localeCompare(b.gameId))
}
