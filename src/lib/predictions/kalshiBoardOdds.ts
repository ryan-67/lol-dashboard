/**
 * Live Kalshi H2H odds for the Predictions schedule board.
 *
 * Architecture (recommended + implemented):
 * - Browser never talks to Kalshi directly (CORS + API key).
 * - Edge function `kalshi-board` polls Kalshi Trade API v2, caches ~90s server-side,
 *   returns matchup → implied probs.
 * - Client refreshes every 60s + on window focus so the column tracks live markets
 *   without hammering Kalshi or blending into model probability (display-only).
 */
import { supabase } from '../supabaseClient'

export interface KalshiBoardQuote {
  matchId: string
  /** e.g. "58–42" for teamA–teamB implied, or "—" */
  display: string
  teamAPercent: number | null
  teamBPercent: number | null
  ticker: string | null
  updatedAt: string | null
}

export interface KalshiBoardMatchup {
  matchId: string
  teamA: string
  teamB: string
  league?: string
  tournament?: string
}

const POLL_MS = 60_000

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

export async function fetchKalshiBoardOdds(
  matchups: KalshiBoardMatchup[],
): Promise<Record<string, KalshiBoardQuote>> {
  if (!matchups.length) return {}
  const base = getFunctionBase()
  if (!base) return {}

  try {
    const res = await fetch(`${base}/functions/v1/kalshi-board`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ matchups }),
    })
    if (!res.ok) return {}
    const body = (await res.json()) as { odds?: Record<string, KalshiBoardQuote> }
    return body.odds ?? {}
  } catch {
    return {}
  }
}

/** Subscribe to periodic Kalshi refreshes. Returns cleanup. */
export function subscribeKalshiBoardOdds(
  getMatchups: () => KalshiBoardMatchup[],
  onUpdate: (odds: Record<string, KalshiBoardQuote>) => void,
): () => void {
  let cancelled = false

  const tick = async () => {
    const matchups = getMatchups()
    if (!matchups.length || cancelled) return
    const odds = await fetchKalshiBoardOdds(matchups)
    if (!cancelled) onUpdate(odds)
  }

  void tick()
  const id = window.setInterval(() => void tick(), POLL_MS)
  const onFocus = () => void tick()
  window.addEventListener('focus', onFocus)

  return () => {
    cancelled = true
    window.clearInterval(id)
    window.removeEventListener('focus', onFocus)
  }
}

export { POLL_MS as KALSHI_BOARD_POLL_MS }
