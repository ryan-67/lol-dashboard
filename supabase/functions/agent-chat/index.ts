import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { classifyIntent, pickFinalModel } from "./helpers/classify.ts";
import { resolveConversation, persistMessages } from "./helpers/conversation.ts";
import { corsHeaders } from "./helpers/cors.ts";
import { createServiceClient, createUserClient, getEnv } from "./helpers/clients.ts";
import { finalMessages } from "./helpers/prompts.ts";
import { streamFallback, streamFinalAnswer } from "./helpers/stream.ts";
import { sqlQuery, vectorSearch } from "./helpers/tools.ts";

interface ChatRequestBody {
  message?: string;
  conversation_id?: string;
}

const encoder = new TextEncoder();

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

        const plan = await classifyIntent(openrouterApiKey, message, conversation.history);

        let dbResults: unknown = null;
        let externalContext = "";

        if (plan.needs_sql) {
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

        const finalModel = pickFinalModel(plan);
        const messages = finalMessages(conversation.history, message, dbResults, externalContext);

        assistantText = await streamFinalAnswer({
          apiKey: openrouterApiKey,
          model: finalModel,
          messages,
          plan,
          writer,
        });

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