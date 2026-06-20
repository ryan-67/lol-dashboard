import type { IntentPlan } from "./classify.ts";
import { MODEL_COMPLEX_FALLBACK } from "./models.ts";
import { openRouterStream } from "./openrouter.ts";

function sseLine(payload: string): string {
  return `data: ${payload}\n\n`;
}

async function streamWithModel(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  plan: IntentPlan;
  onToken?: (token: string) => void;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  maxTokens?: number;
  frequencyPenalty?: number;
}): Promise<string> {
  const encoder = new TextEncoder();
  let fullText = "";

  const upstream = await openRouterStream(args.apiKey, {
    model: args.model,
    messages: args.messages,
    // Low temperature: this is a grounded analyst, not a creative writer. Higher
    // values caused confident confabulation of stats/rosters/series that aren't in
    // the provided context. Keep just enough warmth for the casual voice.
    temperature: args.plan.complexity === "complex" ? 0.4 : 0.3,
    max_tokens: args.maxTokens ?? 1000,
    frequency_penalty: args.frequencyPenalty ?? 0.35,
    stream: true,
  });

  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          fullText += delta;
          args.onToken?.(delta);
          await args.writer.write(encoder.encode(sseLine(JSON.stringify({ type: "chunk", chunk: delta }))));
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  await args.writer.write(encoder.encode(sseLine("[DONE]")));
  return fullText;
}

export async function streamFinalAnswer(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  plan: IntentPlan;
  onToken?: (token: string) => void;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  maxTokens?: number;
  frequencyPenalty?: number;
}): Promise<string> {
  try {
    return await streamWithModel({ ...args, model: args.model });
  } catch (err) {
    if (args.plan.complexity === "complex" && args.model !== MODEL_COMPLEX_FALLBACK) {
      return await streamWithModel({ ...args, model: MODEL_COMPLEX_FALLBACK });
    }
    throw err;
  }
}

export async function streamFallback(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  message: string,
): Promise<void> {
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", chunk: message })}\n\n`));
  await writer.write(encoder.encode("data: [DONE]\n\n"));
}
