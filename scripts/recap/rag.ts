import type { SupabaseClient } from '@supabase/supabase-js'
import { embedText } from './openrouter.ts'

interface RagChunk {
  content?: string
  metadata?: Record<string, unknown>
  similarity?: number
}

export async function fetchRagContext(
  client: SupabaseClient,
  query: string,
  league: string,
): Promise<string> {
  try {
    const embedding = await embedText(query)
    const attempts: Array<Record<string, unknown>> = [
      { query_embedding: embedding, match_count: 6, match_threshold: 0.42 },
      { query_embedding: embedding, match_count: 6, match_threshold: 0.42, filter: { league } },
      { embedding: embedding, match_count: 6, match_threshold: 0.42 },
    ]

    for (const params of attempts) {
      const { data, error } = await client.rpc('match_documents', params)
      if (error) continue
      const chunks = (data ?? []) as RagChunk[]
      const lines = chunks
        .map((c) => (c.content ?? '').trim())
        .filter(Boolean)
        .slice(0, 5)
      if (lines.length) return lines.join('\n---\n')
    }
    return ''
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
  return `${league} ${winner} vs ${loser} ${score} post match thread discussion ${date} lolesports`
}
