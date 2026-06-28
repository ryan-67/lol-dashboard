import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { resolveConversation, persistMessages } from "./helpers/conversation.ts";
import { corsHeaders } from "./helpers/cors.ts";
import { createServiceClient, createUserClient, getEnv } from "./helpers/clients.ts";
import { streamFallback } from "./helpers/stream.ts";
import type { DashboardFilters } from "./helpers/oeData.ts";
import { resolveAgentFilters } from "./helpers/agentFilters.ts";
// 3-layer pipeline: Guardrail Router → Tool Decider → Synthesis.
import { runGuardrail } from "./pipeline/guardrail.ts";
import { decideAndFetch } from "./pipeline/toolDecider.ts";
import { synthesize } from "./pipeline/synthesis.ts";
import type { ResolvedFilters } from "./pipeline/types.ts";
import { extractDraftFromText, looksLikeDraftTextInput } from "./helpers/draftTextParse.ts";
import {
  draftExtractionSummary,
  formatDraftExtractionBlock,
} from "./helpers/draftTypes.ts";

interface ChatRequestBody extends DashboardFilters {
  message?: string;
  conversation_id?: string;
  client_now?: string;
}

const encoder = new TextEncoder();

// Beta limits — keep in sync with src/lib/nuckyAiBilling.ts ($3.99/mo tier).
// Set USAGE_LIMITS_ENABLED = true before enforcing in production/beta launch.
const USAGE_LIMITS_ENABLED = false;
const DAILY_LIMIT = 15;
const MONTHLY_LIMIT = 200;

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

async function getUsageCounts(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  ipAddress: string,
): Promise<{ dailyUser: number; dailyIp: number; monthlyUser: number; monthlyIp: number }> {
  const now = new Date();
  const dailySince = new Date(now);
  dailySince.setUTCHours(0, 0, 0, 0);
  const monthlySince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [dailyUserRes, dailyIpRes, monthlyUserRes, monthlyIpRes] = await Promise.all([
    serviceClient
      .from("agent_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dailySince.toISOString()),
    serviceClient
      .from("agent_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ipAddress)
      .gte("created_at", dailySince.toISOString()),
    serviceClient
      .from("agent_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthlySince.toISOString()),
    serviceClient
      .from("agent_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ipAddress)
      .gte("created_at", monthlySince.toISOString()),
  ]);

  if (dailyUserRes.error || dailyIpRes.error || monthlyUserRes.error || monthlyIpRes.error) {
    throw new Error("Failed to read usage limits");
  }

  return {
    dailyUser: dailyUserRes.count ?? 0,
    dailyIp: dailyIpRes.count ?? 0,
    monthlyUser: monthlyUserRes.count ?? 0,
    monthlyIp: monthlyIpRes.count ?? 0,
  };
}

async function recordUsage(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  ipAddress: string,
): Promise<void> {
  const { error } = await serviceClient.from("agent_usage_events").insert({
    user_id: userId,
    ip_address: ipAddress,
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
  const { openrouterApiKey, tavilyApiKey, kalshiApiKey } = getEnv();

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
          const usage = await getUsageCounts(serviceClient, user.id, ipAddress);
          if (usage.dailyUser >= DAILY_LIMIT || usage.dailyIp >= DAILY_LIMIT) {
            const resetAt = new Date();
            resetAt.setUTCDate(resetAt.getUTCDate() + 1);
            resetAt.setUTCHours(0, 0, 0, 0);
            controller.enqueue(
              encoder.encode(
                sseError(
                  "quota_exceeded",
                  "daily limit reached (25 requests). try again tomorrow.",
                  resetAt.toISOString(),
                ),
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }
          if (usage.monthlyUser >= MONTHLY_LIMIT || usage.monthlyIp >= MONTHLY_LIMIT) {
            controller.enqueue(
              encoder.encode(sseError("quota_exceeded", "monthly cap reached (750 requests). try again next month.")),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }
          await recordUsage(serviceClient, user.id, ipAddress);
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

        const rosterSplitHint =
          body.split?.trim() && /^\d{4}/.test(body.split.trim()) ? body.split.trim() : undefined;
        const dashboardFilters: DashboardFilters = {
          league: body.league,
          split: body.split,
          year: body.year,
          selectedLeagues: body.selectedLeagues,
          selectedYears: body.selectedYears,
          selectedSplits: body.selectedSplits,
        };
        const filters: ResolvedFilters = resolveAgentFilters(message, dashboardFilters);
        if (rosterSplitHint && !filters.rosterSplitHint) {
          filters.rosterSplitHint = rosterSplitHint;
        }

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
        const guardrail = await runGuardrail(openrouterApiKey, pipelineMessage, conversation.history);
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
          kalshiApiKey,
          message: pipelineMessage,
          history: conversation.history,
          guardrail,
          filters,
          clientNow: body.client_now,
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
