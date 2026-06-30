import type { GolGameGoldRecord } from './golGoldMatch'

const GOL_CACHE_URL = `${import.meta.env.BASE_URL}data/gol_game_cache.json`

type CacheEntry = {
  golGameId?: string
  date?: string
  teams?: string[]
  blueTeam?: string
  redTeam?: string
  goldTimelineBlue?: Array<{ minute: number; goldDiffBlue: number }>
  title?: string
}

let cachePromise: Promise<GolGameGoldRecord[]> | null = null

function gameNumberFromTitle(title: string | undefined): number | null {
  if (!title) return null
  const match = title.match(/\bgame\s+(\d+)\b/i)
  return match ? Number(match[1]) : null
}

function entryToRecord(entry: CacheEntry, key: string): GolGameGoldRecord | null {
  const timeline = entry.goldTimelineBlue ?? []
  if (timeline.length < 4) return null

  const teams = entry.teams ?? []
  const blueTeam = entry.blueTeam ?? teams[0] ?? null
  const redTeam = entry.redTeam ?? teams[1] ?? null

  return {
    golGameId: entry.golGameId ?? key,
    gameDate: (entry.date ?? '').slice(0, 10),
    gameNumber: gameNumberFromTitle(entry.title),
    blueTeam,
    redTeam,
    goldTimelineBlue: timeline,
  }
}

/** Load gol.gg gold timelines from the static ingest cache (if present). */
export async function fetchGolGoldCache(): Promise<GolGameGoldRecord[]> {
  if (!cachePromise) {
    cachePromise = fetch(GOL_CACHE_URL, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) return []
        const body = (await res.json()) as Record<string, CacheEntry>
        return Object.entries(body)
          .map(([key, entry]) => entryToRecord(entry, key))
          .filter((row): row is GolGameGoldRecord => row != null)
      })
      .catch(() => [])
  }
  return cachePromise
}
