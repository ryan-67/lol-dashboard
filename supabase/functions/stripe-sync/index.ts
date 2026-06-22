import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createBillingServiceClient,
  createStripeClient,
  syncCheckoutSession,
  syncUserSubscriptionsFromStripe,
} from "../_shared/billingSync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY") ?? "";

function corsHeaders(origin: string | null) {
  const allowedOrigins = new Set(["https://nucky.gg", "https://www.nucky.gg", "http://localhost:5173"]);
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "https://nucky.gg";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    const body = await req.json().catch(() => ({} as { session_id?: string }));
    const sessionId = String(body?.session_id ?? "").trim();

    const serviceClient = createBillingServiceClient();
    const stripe = createStripeClient();

    const result = sessionId
      ? await syncCheckoutSession(serviceClient, stripe, sessionId, user.id)
      : await syncUserSubscriptionsFromStripe(serviceClient, stripe, user.id, user.email);

    return new Response(JSON.stringify(result), { status: 200, headers: cors });
  } catch (error) {
    console.error("[stripe-sync] error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Sync failed" }),
      { status: 500, headers: cors },
    );
  }
});
