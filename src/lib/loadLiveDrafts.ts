/** Load draft-complete snapshots published by sync:cito-live-drafts. */

export interface LiveDraftPick {
  championName: string
  role: string | null
}

export interface LiveDraftRow {
  matchId: string
  gameId: string | null
  gameNumber: number | null
  league: string
  teamA: string
  teamB: string
  blueTeam: string | null
  redTeam: string | null
  bluePicks: LiveDraftPick[]
  redPicks: LiveDraftPick[]
  blueBans: string[]
  redBans: string[]
  draftComplete: boolean
  status: string
  scheduledAt: string | null
  fetchedAt: string
}

export interface LiveDraftsBundle {
  generatedAt: string
  drafts: LiveDraftRow[]
}

let cache: LiveDraftsBundle | null = null
let inflight: Promise<LiveDraftsBundle> | null = null

export async function fetchLiveDraftsBundle(force = false): Promise<LiveDraftsBundle> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = fetch(`${import.meta.env.BASE_URL}data/cito_live_drafts.json?t=${Date.now()}`, {
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) return { generatedAt: '', drafts: [] }
      const json = (await res.json()) as Partial<LiveDraftsBundle>
      const bundle: LiveDraftsBundle = {
        generatedAt: typeof json.generatedAt === 'string' ? json.generatedAt : '',
        drafts: Array.isArray(json.drafts) ? (json.drafts as LiveDraftRow[]) : [],
      }
      cache = bundle
      return bundle
    })
    .catch(() => ({ generatedAt: '', drafts: [] }))
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function draftByMatchId(
  bundle: LiveDraftsBundle | null,
  matchId: string,
): LiveDraftRow | null {
  if (!bundle?.drafts?.length || !matchId) return null
  const normalized = matchId.startsWith('lol-match-') ? matchId : `lol-match-${matchId}`
  return (
    bundle.drafts.find((d) => d.matchId === matchId || d.matchId === normalized) ?? null
  )
}
