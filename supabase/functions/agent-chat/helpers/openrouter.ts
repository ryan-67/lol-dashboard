export type MessageContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
}

interface ChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  stream?: boolean;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
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

import type { UsageTracker } from "./usageTracker.ts";

export async function embedText(
  apiKey: string,
  text: string,
  usageTracker?: UsageTracker,
): Promise<number[]> {
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
  usageTracker?.add(json);
  const vector = json.data?.[0]?.embedding;
  if (!vector) {
    throw new Error(json.error?.message ?? "Embedding response missing vector");
  }

  return vector;
}

export async function completeOnce(
  apiKey: string,
  request: ChatRequest,
  usageTracker?: UsageTracker,
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
  usageTracker?.add(json);
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