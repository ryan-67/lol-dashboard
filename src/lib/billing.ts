import { supabase } from './supabaseClient'

function getFunctionBase(): string {
  return (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
}

async function authHeaders(): Promise<Record<string, string>> {
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(anonKey ? { apikey: anonKey } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

export async function syncStripeSubscription(sessionId?: string): Promise<{ isSubscribed: boolean }> {
  const response = await fetch(`${getFunctionBase()}/functions/v1/stripe-sync`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  })
  if (!response.ok) {
    throw new Error(`sync failed (${response.status})`)
  }
  return (await response.json()) as { isSubscribed: boolean }
}

export async function startStripeCheckout(): Promise<string> {
  const priceId = (import.meta.env.VITE_STRIPE_PRICE_ID ?? '').trim()
  if (!priceId) throw new Error('missing VITE_STRIPE_PRICE_ID')

  const response = await fetch(`${getFunctionBase()}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ price_id: priceId }),
  })
  if (!response.ok) {
    throw new Error(`checkout failed (${response.status})`)
  }
  const payload = (await response.json()) as { url?: string; alreadySubscribed?: boolean }
  if (!payload.url) throw new Error('missing checkout url')
  return payload.url
}

export async function openStripePortal(returnUrl?: string): Promise<string> {
  const response = await fetch(`${getFunctionBase()}/functions/v1/stripe-portal`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ return_url: returnUrl ?? 'https://nucky.gg/profile' }),
  })
  if (!response.ok) {
    throw new Error(`portal failed (${response.status})`)
  }
  const payload = (await response.json()) as { url?: string }
  if (!payload.url) throw new Error('missing portal url')
  return payload.url
}
