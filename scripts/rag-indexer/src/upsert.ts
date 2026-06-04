import { createClient } from '@supabase/supabase-js'
import {
  DRY_RUN,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  UPSERT_BATCH_SIZE,
  requireEnv,
} from './config.js'
import type { DocumentUpsertRow, TextChunk } from './types.js'
import { embedTexts } from './embed.js'

function toUpsertRow(chunk: TextChunk, embedding: number[]): DocumentUpsertRow {
  return {
    content: chunk.content,
    embedding,
    source: chunk.source,
    source_url: chunk.sourceUrl,
    chunk_index: chunk.chunkIndex,
    title: chunk.title,
    metadata: {
      source_url: chunk.sourceUrl,
      title: chunk.title,
      scraped_at: chunk.scrapedAt,
      chunk_index: chunk.chunkIndex,
      ...(chunk.contentKind ? { content_kind: chunk.contentKind } : {}),
      ...(chunk.league ? { league: chunk.league } : {}),
    },
  }
}

export async function upsertChunks(chunks: TextChunk[]): Promise<number> {
  if (!chunks.length) {
    console.log('No chunks to upsert.')
    return 0
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Would embed and upsert ${chunks.length} document row(s).`)
    for (const chunk of chunks.slice(0, 5)) {
      console.log(
        `[dry-run] ${chunk.source} ${chunk.sourceUrl} #${chunk.chunkIndex} (${chunk.content.length} chars)`,
      )
    }
    if (chunks.length > 5) {
      console.log(`[dry-run] ... and ${chunks.length - 5} more`)
    }
    return chunks.length
  }

  console.log(`Embedding ${chunks.length} chunk(s)...`)
  const embeddings = await embedTexts(chunks.map((c) => c.content))
  const rows = chunks.map((chunk, idx) => toUpsertRow(chunk, embeddings[idx]))

  const url = requireEnv('SUPABASE_URL', SUPABASE_URL)
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY)
  const supabase = createClient(url, key)

  let upserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE)
    const { error } = await supabase.from('documents').upsert(batch, {
      onConflict: 'source,source_url,chunk_index',
    })
    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`)
    }
    upserted += batch.length
    console.log(`Upserted ${upserted}/${rows.length}`)
  }

  return upserted
}

export async function pruneStaleChunks(
  source: string,
  sourceUrl: string,
  keepCount: number,
): Promise<void> {
  if (DRY_RUN) return

  const url = requireEnv('SUPABASE_URL', SUPABASE_URL)
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY)
  const supabase = createClient(url, key)

  const { data, error } = await supabase
    .from('documents')
    .select('chunk_index')
    .eq('source', source)
    .eq('source_url', sourceUrl)
    .gt('chunk_index', keepCount - 1)

  if (error || !data?.length) return

  const staleIndexes = data.map((row) => row.chunk_index as number)
  await supabase
    .from('documents')
    .delete()
    .eq('source', source)
    .eq('source_url', sourceUrl)
    .in('chunk_index', staleIndexes)
}
