import { requireEnv } from './db.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const DEFAULT_RECAP_MODEL =
  process.env.RECAP_LLM_MODEL?.trim() || 'google/gemini-2.0-flash-001'

export const EMBEDDING_MODEL =
  process.env.RECAP_EMBEDDING_MODEL?.trim() || 'openai/text-embedding-3-small'

async function openRouterPost<T>(url: string, body: unknown): Promise<T> {
  const apiKey = requireEnv('OPENROUTER_API_KEY')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nucky.gg',
      'X-Title': 'nucky weekly recap',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`)
  }
  return res.json() as Promise<T>
}

export async function embedText(text: string): Promise<number[]> {
  const payload = await openRouterPost<{
    data?: Array<{ embedding?: number[] }>
  }>(OPENROUTER_URL, {
    model: EMBEDDING_MODEL,
    input: text,
  })
  const embedding = payload.data?.[0]?.embedding
  if (!embedding?.length) throw new Error('Empty embedding from OpenRouter')
  return embedding
}

export async function generateRecapJson(
  systemPrompt: string,
  userPrompt: string,
  model = DEFAULT_RECAP_MODEL,
): Promise<string> {
  const payload = await openRouterPost<{
    choices?: Array<{ message?: { content?: string } }>
  }>(CHAT_URL, {
    model,
    temperature: 0.85,
    max_tokens: 320,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Empty LLM response')
  return content
}
