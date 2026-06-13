import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeriesBrief } from '../../src/lib/weeklyRecap.ts'
import { embedText } from './openrouter.ts'

interface RagChunk {
  content?: string
  metadata?: Record<string, unknown>
  similarity?: number
}

async function queryRag(
  client: SupabaseClient,
  query: string,
  league: string,
  matchCount = 4,
): Promise<string[]> {
  const embedding = await embedText(query)
  const attempts: Array<Record<string, unknown>> = [
    { query_embedding: embedding, match_count: matchCount, match_threshold: 0.38 },
    { query_embedding: embedding, match_count: matchCount, match_threshold: 0.38, filter: { league } },
    { embedding: embedding, match_count: matchCount, match_threshold: 0.38 },
  ]

  for (const params of attempts) {
    const { data, error } = await client.rpc('match_documents', params)
    if (error) continue
    return (data ?? [])
      .map((c: RagChunk) => (c.content ?? '').trim())
      .filter(Boolean)
  }
  return []
}

export async function fetchRagContext(
  client: SupabaseClient,
  query: string,
  league: string,
): Promise<string> {
  try {
    const lines = await queryRag(client, query, league, 5)
    return lines.slice(0, 5).join('\n---\n')
  } catch (err) {
    console.warn('RAG fetch skipped:', err instanceof Error ? err.message : err)
    return ''
  }
}

export function buildRagQuery(
  winner: string,
  loser: string,
  league: string,
  score: string,
  date: string,
): string {
  return `${league} ${winner} vs ${loser} ${score} post match thread discussion reaction ${date}`
}

function yearFromDate(date: string): string {
  return date.slice(0, 4) || String(new Date().getFullYear())
}

/** Multi-angle RAG: post-match threads, standings/playoffs stakes, team narratives. */
export async function fetchRecapRagBundle(
  client: SupabaseClient,
  brief: SeriesBrief,
): Promise<string> {
  const { winner, loser, score, league } = brief.facts
  const year = yearFromDate(brief.date)
  const queries = [
    buildRagQuery(winner, loser, league, score, brief.date),
    `${league} ${winner} ${loser} playoffs MSI worlds qualification standings implications ${year}`,
    `${winner} vs ${loser} ${league} rivalry storyline form narrative ${year}`,
    `${winner} ${loser} reddit post match thread hot takes underperform bounce back`,
  ]

  const seen = new Set<string>()
  const chunks: string[] = []

  for (const query of queries) {
    try {
      const lines = await queryRag(client, query, league, 3)
      for (const line of lines) {
        const key = line.slice(0, 120)
        if (seen.has(key)) continue
        seen.add(key)
        chunks.push(line)
      }
    } catch {
      // continue other queries
    }
  }

  return chunks.slice(0, 10).join('\n---\n')
}
