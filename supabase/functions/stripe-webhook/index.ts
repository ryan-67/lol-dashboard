import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@latest?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-05-28.basil",
});

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const responseHeaders = { "Content-Type": "application/json" };

function toIso(timestamp?: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

async function upsertSubscription(input: {
  user_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id: string;
  status?: string | null;
  price_id?: string | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
}) {
  const payload = {
    user_id: input.user_id ?? null,
    stripe_customer_id: input.stripe_customer_id ?? null,
    stripe_subscription_id: input.stripe_subscription_id,
    status: input.status ?? null,
    price_id: input.price_id ?? null,
    current_period_start: toIso(input.current_period_start),
    current_period_end: toIso(input.current_period_end),
    cancel_at_period_end: Boolean(input.cancel_at_period_end),
  };
  await serviceClient.from("subscriptions").upsert(payload, {
    onConflict: "stripe_subscription_id",
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ received: true }), { status: 200, headers: responseHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      throw new Error("Missing env config");
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("Missing Stripe-Signature");

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const userId = session.client_reference_id;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          price_id: subscription.items.data[0]?.price?.id ?? null,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
      }

      if (userId) {
        await serviceClient
          .from("profiles")
          .update({ is_subscribed: true, plan: "pro" })
          .eq("id", userId);
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscription({
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        price_id: subscription.items.data[0]?.price?.id ?? null,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await serviceClient
        .from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: true })
        .eq("stripe_subscription_id", subscription.id);

      const { data } = await serviceClient
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();

      if (data?.user_id) {
        await serviceClient
          .from("profiles")
          .update({ is_subscribed: false, plan: "free" })
          .eq("id", data.user_id);
      }
    }
  } catch (error) {
    console.error("[stripe-webhook] error", error);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: responseHeaders });
});
