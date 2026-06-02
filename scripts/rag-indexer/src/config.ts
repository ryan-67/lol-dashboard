import { config as loadDotenv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

loadDotenv({ path: resolve(repoRoot, '.env') })

export const DRY_RUN = process.argv.includes('--dry-run')

export const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
export const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
export const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY ?? '').trim()
export const KALSHI_API_KEY = (process.env.KALSHI_API_KEY ?? '').trim()

export const REDDIT_SUBREDDIT = 'lolesports'
export const REDDIT_USER_AGENT = 'web:nucky-rag-indexer:1.0 (+https://nucky.gg)'
export const REDDIT_MIN_COMMENT_SCORE = 10
export const REDDIT_MAX_THREADS = 40
export const REDDIT_MAX_COMMENTS_PER_THREAD = 25
export const REDDIT_LOOKBACK_DAYS = 21
export const POST_MATCH_TITLE_RE = /post[- ]?match\s+discussion/i

export const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2'
export const KALSHI_LOL_SERIES = [
  'KXLOLGAME',
  'KXLOLMAP',
  'KXLOLTOTAL',
  'KXLOLTOTALMAPS',
] as const

/** Kalshi market titles must match tier-1 pro patterns and avoid academy/college lines */
export const KALSHI_TIER1_RE =
  /\b(LCK|LPL|LEC|LCS|MSI|Worlds|First Stand|T1|Gen\.?G|Hanwha|KT Rolster|Dplus|DRX|Bilibili|Top Esports|Weibo|JD Gaming|G2 Esports|Fnatic|Team Liquid|Cloud9|FlyQuest|100 Thieves|Invictus|EDG|LNG)\b/i
export const KALSHI_EXCLUDE_RE =
  /\b(University|College|Academy|LTA |Hitpoint|Road Of Legends|eSuba|NightBirds|CCG Esports|Winthrop|PCIFIC|Misa Esports)\b/i

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const EMBEDDING_DIM = 1536

export const CHUNK_TARGET = 900
export const CHUNK_MIN = 800
export const CHUNK_MAX = 1000
export const CHUNK_OVERLAP = 200

export const LIQUIPEDIA_API = 'https://liquipedia.net/leagueoflegends/api.php'
export const LIQUIPEDIA_BASE = 'https://liquipedia.net/leagueoflegends'
export const LIQUIPEDIA_USER_AGENT =
  'nucky-rag-indexer/1.0 (+https://nucky.gg; ryan-67/lol-dashboard)'

export const PATCH_NOTES_INDEX_URL =
  'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/'

/** First patch of 2026 Spring split (Jan 2026) */
export const MIN_PATCH_MAJOR = 26
export const MIN_PATCH_MINOR = 1

export const RECENT_MATCHES_PER_LEAGUE = 20

export const TIER1_SPRING_PAGES = [] as const

export const TIER1_TEAM_PAGES = [
  // LCK
  'T1', 'Gen.G', 'Hanwha_Life_Esports', 'KT_Rolster',
  'Nongshim_RedForce', 'DRX', 'BNK_FEARX', 'DN_Freecs',
  // LPL
  'Bilibili_Gaming', 'Top_Esports', 'Weibo_Gaming', 'JD_Gaming', "Anyone's_Legend",
  'LNG_Esports', 'Invictus_Gaming', 'EDward_Gaming', 'FunPlus_Phoenix',
  // LEC
  'G2_Esports', 'Fnatic', 'Team_Vitality', 'Movistar_KOI', 'SK_Gaming',
  'Team_BDS', 'GIANTX', 'Karmine_Corp',
  // LCS
  'Team_Liquid', 'Cloud9', '100_Thieves', 'FlyQuest', 'Shopify_Rebellion',
  'Dignitas', 'NRG', 'Disguised',
] as const

export const TIER1_PLAYER_PAGES = [
  'Faker', 'Chovy', 'Caps', 'Knight', 'Ruler', 'Zeus', 'Gumayusi', 'Keria',
  'Bin', 'JackeyLove', 'Viper', 'Peanut', 'ShowMaker', 'Canyon', 'Deft',
  'Humanoid', 'Elyoya', 'Inspired', 'CoreJJ', 'Blaber', 'Berserker', 'FBI',
] as const

export const REQUEST_DELAY_MS = 2500
export const FETCH_RETRIES = 3
export const EMBED_BATCH_SIZE = 32
export const UPSERT_BATCH_SIZE = 50

export function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
