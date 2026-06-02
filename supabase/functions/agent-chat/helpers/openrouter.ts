export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
}

interface EmbeddingResponse {
  data?: Array<{ embedding: number[] }>;
  error?: { message?: string };
}

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://nucky.gg",
    "X-Title": "nucky analyst agent",
  };
}

export async function embedText(apiKey: string, text: string): Promise<number[]> {
  const response = await fetch(OPENROUTER_EMBED_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as EmbeddingResponse;
  const vector = json.data?.[0]?.embedding;
  if (!vector) {
    throw new Error(json.error?.message ?? "Embedding response missing vector");
  }

  return vector;
}

export async function completeOnce(
  apiKey: string,
  request: ChatRequest,
): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter completion failed (${response.status}): ${await response.text()}`);
  }

  const json = await response.json();
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

export async function openRouterStream(
  apiKey: string,
  request: ChatRequest,
): Promise<Response> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenRouter stream failed (${response.status}): ${await response.text()}`);
  }

  return response;
}