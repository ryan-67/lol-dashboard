import { supabase } from './supabaseClient'

export interface SubscriptionProfile {
  is_subscribed?: boolean | null
  plan?: string | null
  username?: string | null
}

export interface SubscriptionStatusRow {
  status?: string | null
}

export function isUserSubscribed(
  profile: SubscriptionProfile | null | undefined,
  subscriptions: SubscriptionStatusRow[] | null | undefined,
): boolean {
  const hasActiveSub =
    Array.isArray(subscriptions) &&
    subscriptions.some((row) => row.status === 'active' || row.status === 'trialing')
  return Boolean(profile?.is_subscribed) || profile?.plan === 'pro' || hasActiveSub
}

export async function fetchSubscriptionState(userId: string): Promise<{
  profile: SubscriptionProfile | null
  isSubscribed: boolean
}> {
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    supabase.from('profiles').select('is_subscribed, plan, username').eq('id', userId).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .limit(1),
  ])

  const profileRow = (profile as SubscriptionProfile | null) ?? null
  return {
    profile: profileRow,
    isSubscribed: isUserSubscribed(profileRow, subscriptions as SubscriptionStatusRow[] | null),
  }
}
