import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@latest?target=deno";

export function createBillingServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Missing Supabase service config");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createStripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-05-28.basil" });
}

function toIso(timestamp?: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

async function resolveUserId(
  serviceClient: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  hintUserId?: string | null,
): Promise<string | null> {
  if (hintUserId) return hintUserId;

  const { data: existing } = await serviceClient
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (existing?.user_id) return existing.user_id as string;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  if (customer.metadata?.user_id) return customer.metadata.user_id;

  return null;
}

export async function syncSubscriptionRecord(
  serviceClient: SupabaseClient,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  hintUserId?: string | null,
): Promise<{ userId: string | null; isSubscribed: boolean }> {
  const userId = await resolveUserId(serviceClient, stripe, subscription, hintUserId);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const isSubscribed = subscription.status === "active" || subscription.status === "trialing";

  const { data: existing } = await serviceClient
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const resolvedUserId = userId ?? (existing?.user_id as string | null) ?? null;

  const { error: subError } = await serviceClient.from("subscriptions").upsert(
    {
      user_id: resolvedUserId,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      price_id: subscription.items.data[0]?.price?.id ?? null,
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (subError) throw new Error(`subscriptions upsert failed: ${subError.message}`);

  if (resolvedUserId) {
    await setProfileSubscription(serviceClient, resolvedUserId, isSubscribed);
  }

  return { userId: resolvedUserId, isSubscribed };
}

async function setProfileSubscription(
  serviceClient: SupabaseClient,
  userId: string,
  isSubscribed: boolean,
): Promise<void> {
  const plan = isSubscribed ? "pro" : "free";

  const { error: rpcError } = await serviceClient.rpc("set_profile_subscription", {
    p_user_id: userId,
    p_is_subscribed: isSubscribed,
    p_plan: plan,
  });
  if (!rpcError) return;

  const { error: profileError } = await serviceClient.from("profiles").upsert(
    {
      id: userId,
      is_subscribed: isSubscribed,
      plan,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(
      `profiles update failed (rpc: ${rpcError.message}; direct: ${profileError.message})`,
    );
  }
}

export async function syncCheckoutSession(
  serviceClient: SupabaseClient,
  stripe: Stripe,
  sessionId: string,
  userId: string,
): Promise<{ isSubscribed: boolean }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id && session.client_reference_id !== userId) {
    throw new Error("Checkout session does not belong to this user");
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) {
    return { isSubscribed: false };
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const result = await syncSubscriptionRecord(serviceClient, stripe, subscription, userId);
  return { isSubscribed: result.isSubscribed };
}

export async function syncUserSubscriptionsFromStripe(
  serviceClient: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<{ isSubscribed: boolean }> {
  const customers = await stripe.customers.list({ email, limit: 3 });
  let isSubscribed = false;

  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
    for (const subscription of subs.data) {
      const result = await syncSubscriptionRecord(
        serviceClient,
        stripe,
        subscription,
        subscription.metadata?.user_id || customer.metadata?.user_id || userId,
      );
      if (result.isSubscribed) isSubscribed = true;
    }
  }

  return { isSubscribed };
}
