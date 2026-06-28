/** nuckyAI beta billing — keep in sync with supabase/functions/agent-chat/index.ts limits. */
export const NUCKYAI_BETA_PRICE_USD = 3.99

export const NUCKYAI_BETA_MONTHLY_TOKEN_LIMIT = 1_000_000

export const NUCKYAI_BETA_FEATURES = [
  'Ask pro-league questions answered from live nucky.gg data — player stats, team form, champion meta, and regional leagues (LCK, LPL, LEC, LCS)',
  'Compare players and teams with inline radar charts, win-rate curves, and cited GD@15, KDA, dmg%, and performance scores',
  'Break down matchups, series results, draft picks, and weekly recaps without leaving chat',
  'Get patch-aware reads: pick/ban trends, champion pools, roster context, and matchup edges for MSI, Worlds, and regional play',
  'Follow-up in threaded chats — nucky remembers context within the conversation',
] as const

export function formatNuckyAiBetaPrice(): string {
  return `$${NUCKYAI_BETA_PRICE_USD.toFixed(2)}`
}

export function nuckyAiBetaUsageLabel(): string {
  return '1M tokens/month'
}
