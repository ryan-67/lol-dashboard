import { NUCKYAI_BETA_MONTHLY_TOKEN_LIMIT } from './nuckyAiBilling'
import { supabase } from './supabaseClient'

export interface AgentUsageMonthly {
  tokens_used: number
  tokens_limit: number
  period_start: string
  period_end: string
  reset_at: string
}

export async function fetchMyAgentUsage(): Promise<AgentUsageMonthly | null> {
  const { data, error } = await supabase.rpc('get_my_agent_usage')
  if (error || !data) return null
  return data as AgentUsageMonthly
}

export function formatUsagePercent(used: number, limit = NUCKYAI_BETA_MONTHLY_TOKEN_LIMIT): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

export function formatUsageResetDate(resetAt: string): string {
  return new Date(resetAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
