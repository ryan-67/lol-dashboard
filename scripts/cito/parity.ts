import type { CitoGameSummary, CitoPostgamePayload, LinkageCandidate, OeGameRecord } from './types.ts'

export interface ParityRow {
  oeGameId: string
  citoGameId: string
  checks: Array<{
    metric: string
    oe: number | null
    cito: number | null
    delta: number | null
    ok: boolean
  }>
}

function closeEnough(a: number | null | undefined, b: number | null | undefined, tolerance: number): boolean {
  if (a == null || b == null) return false
  return Math.abs(a - b) <= tolerance
}

function sumTeamKills(game: CitoGameSummary, teamSlug?: string): number | null {
  if (!teamSlug) return null
  const slug = teamSlug.toLowerCase()
  if (game.blueTeam?.slug?.toLowerCase() === slug) return game.blueTeam.kills ?? null
  if (game.redTeam?.slug?.toLowerCase() === slug) return game.redTeam.kills ?? null
  return null
}

export function oeTeamKillsForGame(games: OeGameRecord[], gameId: string, team: string): number | null {
  const rows = games.filter((g) => g.gameId === gameId && g.team === team)
  if (!rows.length) return null
  return rows.reduce((sum, g) => sum + (g.kills ?? 0), 0)
}

export function buildParityRows(
  links: LinkageCandidate[],
  oeGames: OeGameRecord[],
  oeById: Map<string, OeGameRecord>,
  citoGamesById: Map<string, CitoGameSummary>,
  postgameById: Map<string, CitoPostgamePayload>,
): ParityRow[] {
  const rows: ParityRow[] = []

  for (const link of links) {
    if (!link.oeGameId) continue
    const oe = oeById.get(link.oeGameId)
    const cito = citoGamesById.get(link.citoGameId)
    const postgame = postgameById.get(link.citoGameId)
    if (!oe || !cito) continue

    const winningTeam = oe.result === 1 ? oe.team : oe.opponent
    const oeTeamKills = oeTeamKillsForGame(oeGames, link.oeGameId, winningTeam)
    const winnerSlug = cito.winnerSlug ?? undefined
    const citoTeamKills =
      winnerSlug != null
        ? sumTeamKills(cito, winnerSlug)
        : sumTeamKills(cito, cito.blueTeam?.slug) ?? sumTeamKills(cito, cito.redTeam?.slug)

    const goldPoints = postgame?.goldGraph?.length ?? 0

    const checks = [
      {
        metric: 'winning_team_kills',
        oe: oeTeamKills,
        cito: citoTeamKills,
        delta: oeTeamKills != null && citoTeamKills != null ? oeTeamKills - citoTeamKills : null,
        ok: closeEnough(oeTeamKills, citoTeamKills, 3),
      },
      {
        metric: 'oe_gd15_present',
        oe: oe.gd15 ?? null,
        cito: null,
        delta: null,
        ok: oe.gd15 != null,
      },
      {
        metric: 'cito_gold_graph_points',
        oe: null,
        cito: goldPoints,
        delta: null,
        ok: goldPoints >= 8,
      },
    ]

    rows.push({ oeGameId: link.oeGameId, citoGameId: link.citoGameId, checks })
  }

  return rows
}

export function parityPassRate(rows: ParityRow[]): number {
  if (!rows.length) return 0
  const checks = rows.flatMap((r) => r.checks)
  if (!checks.length) return 0
  const passed = checks.filter((c) => c.ok).length
  return passed / checks.length
}
