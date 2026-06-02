import {
  EMBED_BATCH_SIZE,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  OPENROUTER_API_KEY,
  requireEnv,
} from './config.js'

interface EmbeddingResponse {
  data?: Array<{ embedding: number[]; index: number }>
  error?: { message?: string }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = requireEnv('OPENROUTER_API_KEY', OPENROUTER_API_KEY)
  const results: number[][] = new Array(texts.length)

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nucky.gg',
        'X-Title': 'nucky RAG indexer',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenRouter embeddings failed (${response.status}): ${body}`)
    }

    const payload = (await response.json()) as EmbeddingResponse
    if (payload.error?.message) {
      throw new Error(`OpenRouter embeddings error: ${payload.error.message}`)
    }
    if (!payload.data?.length) {
      throw new Error('OpenRouter embeddings returned no data')
    }

    for (const item of payload.data) {
      if (item.embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `Unexpected embedding dimension ${item.embedding.length}; expected ${EMBEDDING_DIM}`,
        )
      }
      results[i + item.index] = item.embedding
    }
  }

  return results
}
