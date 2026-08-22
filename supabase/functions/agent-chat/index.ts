import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { resolveConversation, persistMessages } from "./helpers/conversation.ts";
import { corsHeaders } from "./helpers/cors.ts";
import { createServiceClient, createUserClient, getEnv } from "./helpers/clients.ts";
import { streamFallback } from "./helpers/stream.ts";
import { buildAgentOEFilters, toResolvedFilters } from "./helpers/agentFilters.ts";
// 3-layer pipeline: Guardrail Router → Tool Decider → Synthesis.
import { runGuardrail } from "./pipeline/guardrail.ts";
import { decideAndFetch } from "./pipeline/toolDecider.ts";
import { synthesize } from "./pipeline/synthesis.ts";
import { extractDraftFromText, looksLikeDraftTextInput } from "./helpers/draftTextParse.ts";
import {
  draftExtractionSummary,
  formatDraftExtractionBlock,
} from "./helpers/draftTypes.ts";
import { UsageTracker } from "./helpers/usageTracker.ts";

interface ChatRequestBody {
  message?: string;
  conversation_id?: string;
  client_now?: string;
  // Legacy dashboard filter fields are ignored — chat scope is question-only.
  league?: string;
  split?: string;
  year?: string;
  selectedLeagues?: string[];
  selectedYears?: string[];
  selectedSplits?: string[];
}

const encoder = new TextEncoder();

// Beta limits — keep in sync with src/lib/nuckyAiBilling.ts ($3.99/mo tier).
// Off during nuckyAI testing. Set AGENT_USAGE_LIMITS=true to re-enable the 1M token/mo gate.
const USAGE_LIMITS_ENABLED =
  Deno.env.get("AGENT_USAGE_LIMITS") === "true" ||
  Deno.env.get("AGENT_USAGE_LIMITS") === "1";
const MONTHLY_TOKEN_LIMIT = 1_000_000;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return (
    firstForwarded ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getMonthResetAt(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function formatQuotaResetDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function getMonthlyTokenUsage(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  const now = new Date();
  const monthlySince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { data, error } = await serviceClient
    .from("agent_usage_events")
    .select("tokens_used")
    .eq("user_id", userId)
    .gte("created_at", monthlySince.toISOString());

  if (error) {
    throw new Error("Failed to read usage limits");
  }

  return (data ?? []).reduce((sum, row) => sum + (Number(row.tokens_used) || 0), 0);
}

async function recordUsage(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  ipAddress: string,
  tokensUsed: number,
): Promise<void> {
  const { error } = await serviceClient.from("agent_usage_events").insert({
    user_id: userId,
    ip_address: ipAddress,
    tokens_used: tokensUsed,
  });
  if (error) {
    throw new Error(`Failed to record usage: ${error.message}`);
  }
}

function sseError(code: string, message: string, resetAt?: string): string {
  return `data: ${JSON.stringify({ type: "error", code, message, reset_at: resetAt })}\n\n`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization");
  const userClient = createUserClient(authHeader);
  const serviceClient = createServiceClient();
  const { openrouterApiKey, tavilyApiKey, citoApiKey, kalshiApiKey } = getEnv();

  if (!openrouterApiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ipAddress = getClientIp(req);
  let conversationId = "";
  let assistantText = "";
  const usageTracker = new UsageTracker();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const writer = {
        write: (chunk: Uint8Array) => {
          controller.enqueue(chunk);
          return Promise.resolve();
        },
      } as WritableStreamDefaultWriter<Uint8Array>;

      try {
        if (USAGE_LIMITS_ENABLED) {
          const monthlyTokens = await getMonthlyTokenUsage(serviceClient, user.id);
          if (monthlyTokens >= MONTHLY_TOKEN_LIMIT) {
            const resetAt = getMonthResetAt();
            controller.enqueue(
              encoder.encode(
                sseError(
                  "quota_exceeded",
                  `you've hit your usage limit for the month. your usage resets on ${formatQuotaResetDate(resetAt)}.`,
                  resetAt.toISOString(),
                ),
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }
        }

        const conversation = await resolveConversation(
          serviceClient,
          user.id,
          message,
          body.conversation_id,
        );
        conversationId = conversation.conversationId;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "metadata", conversation_id: conversationId })}\n\n`,
          ),
        );

        // Question-only OE scope — never inherit dashboard league/split chrome.
        const oeFilters = await buildAgentOEFilters(serviceClient, message);
        const filters = toResolvedFilters(oeFilters);

        // Text draft input: parse team:champ lists and inject structured extraction.
        let pipelineMessage = message;
        const draft = extractDraftFromText(message);
        if (draft && !message.includes("[DRAFT_EXTRACTED]")) {
          const block = formatDraftExtractionBlock(draft);
          const draftOnly =
            looksLikeDraftTextInput(message) &&
            message.replace(/\([^)]+\)/g, "").trim().length < 8;
          pipelineMessage = draftOnly
            ? `analyze this draft — ${draftExtractionSummary(draft)}\n\n${block}`
            : `${message}\n\n${block}`;
        }

        // ===== Layer 1: Guardrail Router (cheap refusal before any deep work) =====
        const guardrail = await runGuardrail(
          openrouterApiKey,
          pipelineMessage,
          conversation.history,
          usageTracker,
        );
        if (!guardrail.allowed) {
          assistantText = guardrail.refusal;
          await streamFallback(writer, assistantText);
          return;
        }

        // ===== Layer 2: Tool Decider (choose sources + fetch evidence) =====
        const evidence = await decideAndFetch({
          serviceClient,
          openrouterApiKey,
          tavilyApiKey,
          citoApiKey,
          kalshiApiKey,
          message: pipelineMessage,
          history: conversation.history,
          guardrail,
          filters,
          clientNow: body.client_now,
          usageTracker,
        });

        // Stream the compare radar (if any) before the synthesized text.
        if (evidence.chartPrefix) {
          await streamFallback(writer, evidence.chartPrefix);
        }

        // ===== Layer 3: Synthesis (cross-verify, generate, write-back to RAG) =====
        const synthesis = await synthesize({
          serviceClient,
          openrouterApiKey,
          message: pipelineMessage,
          history: conversation.history,
          evidence,
          chartPrefix: evidence.chartPrefix,
          writer,
          usageTracker,
        });
        assistantText = synthesis.assistantText;
      } catch (err) {
        const fallback =
          err instanceof Error
            ? `nucky hit a snag: ${err.message}. try again in a sec.`
            : "nucky hit a snag. try again in a sec.";
        await streamFallback(writer, fallback);
        assistantText = fallback;
      } finally {
        if (USAGE_LIMITS_ENABLED && usageTracker.totalTokens > 0) {
          try {
            await recordUsage(serviceClient, user.id, ipAddress, usageTracker.totalTokens);
          } catch {
            // usage recording failure shouldn't break the stream
          }
        }
        if (conversationId) {
          try {
            await persistMessages(serviceClient, user.id, conversationId, message, assistantText);
          } catch {
            // persistence failure shouldn't break the stream
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
