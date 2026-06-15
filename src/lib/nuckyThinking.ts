type ThinkingCategory =
  | 'compare'
  | 'series'
  | 'player'
  | 'team'
  | 'meta'
  | 'schedule'
  | 'historical'
  | 'general'

const MESSAGES: Record<ThinkingCategory, string[]> = {
  compare: [
    'one sec, lining up the radar for that...',
    'lemme pull both sides and compare...',
    'hold on, running the matchup numbers...',
  ],
  series: [
    'lemme dig through that series game by game...',
    'one sec, pulling all 10 players from that matchup...',
    'give me a sec — loading the series log...',
  ],
  player: [
    'lemme pull that player profile...',
    'one sec, checking the stat sheet...',
    'hold on, grabbing those numbers...',
  ],
  team: [
    'lemme check the team sheet...',
    'one sec, pulling team stats...',
    'hold on, running the team numbers...',
  ],
  meta: [
    'lemme scan the draft meta real quick...',
    'one sec, checking champ priority...',
    'hold on, pulling pick/ban data...',
  ],
  schedule: [
    'lemme check the schedule...',
    'one sec, finding upcoming matches...',
    'hold on, pulling the fixture list...',
  ],
  historical: [
    'digging through the archives for that one...',
    'lemme pull career numbers across the years...',
    'one sec — this goes back a while, gimme a moment...',
  ],
  general: [
    'lemme take a look...',
    'one sec, lemme pull that up for you...',
    'hold on, checking what we have...',
  ],
}

function categorizePrompt(message: string): ThinkingCategory {
  const lower = message.toLowerCase()
  if (/\b(all[- ]?time|career|historical|since 20\d{2}|across (splits|years)|archive)\b/.test(lower)) {
    return 'historical'
  }
  if (/\b(series|yesterday|5 game|bo[135]|all 10 players|game by game)\b/.test(lower)) {
    return 'series'
  }
  if (/\b(compare|vs\.?|versus|radar)\b/.test(lower)) return 'compare'
  if (/\b(schedule|upcoming|when does|plays next|fixture)\b/.test(lower)) return 'schedule'
  if (/\b(champion|meta|pick|ban|draft|priority)\b/.test(lower)) return 'meta'
  if (/\b(team|winrate|win rate|objective)\b/.test(lower)) return 'team'
  if (/\b(player|kda|gd15|csd15|laner|mid|jungle|adc|support)\b/.test(lower)) {
    return 'player'
  }
  return 'general'
}

export function pickThinkingMessage(message: string): string {
  const category = categorizePrompt(message)
  const options = MESSAGES[category]
  const idx = Math.abs(hashString(message)) % options.length
  return options[idx]!
}

function hashString(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0
  }
  return h
}
