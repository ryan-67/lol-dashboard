import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { classifyIntent, pickFinalModel } from "./helpers/classify.ts";
import { resolveConversation, persistMessages } from "./helpers/conversation.ts";
import { corsHeaders } from "./helpers/cors.ts";
import { createServiceClient, createUserClient, getEnv } from "./helpers/clients.ts";
import { finalMessages } from "./helpers/prompts.ts";
import { streamFallback, streamFinalAnswer } from "./helpers/stream.ts";
import { chartMarkdownBlock, runTeamCompare } from "./helpers/teamCompare.ts";
import { runPlayerCompare } from "./helpers/playerCompare.ts";
import { sqlQuery, vectorSearch } from "./helpers/tools.ts";

interface ChatRequestBody {
  message?: string;
  conversation_id?: string;
  league?: string;
  split?: string;
}

const encoder = new TextEncoder();
const DAILY_LIMIT = 25;
const MONTHLY_LIMIT = 750;
const OFF_TOPIC_HINTS =
  /\b(recipe|tax return|weather forecast|homework help|write (?:me )?an essay|medical advice|legal advice)\b/i;

function isAllowedQuery(message: string): boolean {
  return !OFF_TOPIC_HINTS.test(message);
}

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
  const { openrouterApiKey } = getEnv();

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
        const usage = await getUsageCounts(serviceClient, user.id, ipAddress);
        if (usage.dailyUser >= DAILY_LIMIT || usage.dailyIp >= DAILY_LIMIT) {
          assistantText = "daily limit reached (25 requests). try again tomorrow.";
          await streamFallback(writer, assistantText);
          return;
        }
        if (usage.monthlyUser >= MONTHLY_LIMIT || usage.monthlyIp >= MONTHLY_LIMIT) {
          assistantText = "monthly cap reached (750 requests). try again next month.";
          await streamFallback(writer, assistantText);
          return;
        }

        await recordUsage(serviceClient, user.id, ipAddress);

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

        if (!isAllowedQuery(message)) {
          assistantText = "i cant help with that.";
          await streamFallback(writer, assistantText);
          return;
        }

        const dashboardLeague = String(body.league ?? "All Tier 1").trim() || "All Tier 1";
        const dashboardSplit = String(body.split ?? "").trim();

        let chartPrefix = "";
        let dbResults: unknown = null;
        let isCompare = false;

        const teamCompare = await runTeamCompare(
          serviceClient,
          message,
          dashboardLeague,
          dashboardSplit || undefined,
        );
        const playerCompare = teamCompare
          ? null
          : await runPlayerCompare(
            serviceClient,
            message,
            dashboardLeague,
            dashboardSplit || undefined,
          );
        const compareResult = teamCompare ?? playerCompare;

        if (compareResult) {
          dbResults = compareResult.data;
          isCompare = true;
          chartPrefix = `${chartMarkdownBlock(compareResult.chart)}\n\n`;
          await streamFallback(writer, chartPrefix);
        }

        const plan = await classifyIntent(openrouterApiKey, message, conversation.history);

        let externalContext = "";

        if (plan.needs_sql && !compareResult) {
          const sql = await sqlQuery(serviceClient, openrouterApiKey, message);
          dbResults = sql.ok ? sql.data : { error: sql.error };
        }

        if (plan.needs_vector) {
          const vec = await vectorSearch(serviceClient, openrouterApiKey, message);
          if (vec.ok) {
            const chunks = (vec.data as Array<{ content: string; source: string; similarity: number }> | undefined) ?? [];
            externalContext = chunks
              .map((c) => `[${c.source} ${Number(c.similarity).toFixed(3)}] ${c.content}`)
              .join("\n\n");
          } else {
            externalContext = `vectorSearch error: ${vec.error}`;
          }
        }

        const resolvedSplit =
          (compareResult?.data as { split?: string } | undefined)?.split ??
          (dashboardSplit || "current split");
        const finalModel = pickFinalModel(plan);
        const messages = finalMessages(conversation.history, message, dbResults, externalContext, {
          league: dashboardLeague,
          split: resolvedSplit,
          teamCompare: isCompare,
        });

        const answer = await streamFinalAnswer({
          apiKey: openrouterApiKey,
          model: finalModel,
          messages,
          plan,
          writer,
        });

        assistantText = chartPrefix + answer;

        if (!assistantText.trim()) {
          assistantText = "couldn't stream a clean response rn, but i'm still here. try again in a sec.";
        }
      } catch (err) {
        const fallback =
          err instanceof Error
            ? `agent backend hit an error: ${err.message}. giving you the quick take with limited context.`
            : "agent backend hit an unknown error. try again in a sec.";
        await streamFallback(writer, fallback);
        assistantText = fallback;
      } finally {
        if (conversationId) {
          try {
            await persistMessages(serviceClient, user.id, conversationId, message, assistantText);
          } catch {
            // Don't fail stream close if persistence fails.
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