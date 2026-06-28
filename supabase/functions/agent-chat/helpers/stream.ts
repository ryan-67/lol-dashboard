import type { IntentPlan } from "./classify.ts";
import { MODEL_COMPLEX_FALLBACK } from "./models.ts";
import { openRouterStream } from "./openrouter.ts";
import type { UsageTracker } from "./usageTracker.ts";

function sseLine(payload: string): string {
  return `data: ${payload}\n\n`;
}

/** Extract incremental or cumulative text from an OpenRouter SSE chunk. */
function extractStreamPiece(json: unknown): { mode: "delta" | "cumulative"; text: string } | null {
  const choice = (json as { choices?: Array<{ delta?: { content?: string; text?: string }; message?: { content?: string } }> })?.choices?.[0];
  if (!choice) return null;

  const deltaContent = choice.delta?.content ?? choice.delta?.text;
  if (typeof deltaContent === "string" && deltaContent.length > 0) {
    return { mode: "delta", text: deltaContent };
  }

  const messageContent = choice.message?.content;
  if (typeof messageContent === "string" && messageContent.length > 0) {
    return { mode: "cumulative", text: messageContent };
  }

  return null;
}

/**
 * Normalize provider stream chunks to NEW text only.
 * Some models send cumulative message.content instead of delta slices — track position
 * so we never re-emit prior tokens (prevents roster/stat block duplication in UI).
 */
function appendStreamPiece(
  fullText: string,
  piece: { mode: "delta" | "cumulative"; text: string },
): { fullText: string; emit: string } {
  if (piece.mode === "delta") {
    return { fullText: fullText + piece.text, emit: piece.text };
  }

  // Cumulative: only emit the suffix beyond what we've already streamed.
  if (piece.text.startsWith(fullText)) {
    const emit = piece.text.slice(fullText.length);
    return { fullText: piece.text, emit };
  }

  // Provider reset or mismatch — emit only if not already contained.
  if (fullText.endsWith(piece.text) || fullText.includes(piece.text)) {
    return { fullText, emit: "" };
  }

  return { fullText: fullText + piece.text, emit: piece.text };
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
  usageTracker?: UsageTracker;
}): Promise<string> {
  const encoder = new TextEncoder();
  let fullText = "";

  const upstream = await openRouterStream(args.apiKey, {
    model: args.model,
    messages: args.messages,
    temperature: args.plan.complexity === "complex" ? 0.4 : 0.3,
    max_tokens: args.maxTokens ?? 1000,
    frequency_penalty: args.frequencyPenalty ?? 0.3,
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
        args.usageTracker?.add(json);
        const piece = extractStreamPiece(json);
        if (!piece) continue;

        const { fullText: next, emit } = appendStreamPiece(fullText, piece);
        fullText = next;
        if (!emit) continue;

        args.onToken?.(emit);
        await args.writer.write(encoder.encode(sseLine(JSON.stringify({ type: "chunk", chunk: emit }))));
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
  usageTracker?: UsageTracker;
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
