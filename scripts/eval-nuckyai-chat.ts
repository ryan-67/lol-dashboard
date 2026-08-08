/**
 * Offline nuckyAI chat eval — hundreds of LoL-esports prompts against agent-chat.
 *
 * Auth: creates/signs in a dedicated eval user via service role (no Gmail).
 * Requires: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *           VITE_SUPABASE_ANON_KEY, and a deployed agent-chat with
 *           AGENT_USAGE_LIMITS=false for bulk runs.
 *
 * Usage:
 *   npx tsx scripts/eval-nuckyai-chat.ts
 *   npx tsx scripts/eval-nuckyai-chat.ts --limit 40
 *   npx tsx scripts/eval-nuckyai-chat.ts --category schedule
 *   npx tsx scripts/eval-nuckyai-chat.ts --out .tmp/nuckyai_eval.json
 */
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

loadEnv({ path: resolve(process.cwd(), '.env') })

const EVAL_EMAIL = process.env.NUCKYAI_EVAL_EMAIL ?? 'nuckyai-eval@nucky.local'
const EVAL_PASSWORD = process.env.NUCKYAI_EVAL_PASSWORD ?? 'NuckyEval!2026-bulk'
const CONCURRENCY = Math.max(1, Number(process.env.NUCKYAI_EVAL_CONCURRENCY ?? 2))

type ExpectKind =
  | 'answers'
  | 'refuses'
  | 'clarifies'
  | 'mentions_source'
  | 'no_crash'

interface PromptCase {
  id: string
  category: string
  prompt: string
  expect: ExpectKind
  /** Substrings that should appear (case-insensitive) when expect=answers */
  shouldInclude?: string[]
  /** Substrings that must NOT appear */
  shouldExclude?: string[]
}

function buildPromptBank(): PromptCase[] {
  const cases: PromptCase[] = []
  const add = (
    category: string,
    prompt: string,
    expect: ExpectKind = 'answers',
    extra: Partial<PromptCase> = {},
  ) => {
    cases.push({
      id: `${category}-${cases.length + 1}`,
      category,
      prompt,
      expect,
      ...extra,
    })
  }

  // --- Schedule / recent results (warehouse) ---
  const schedulePrompts = [
    'who won in the LCK this weekend?',
    'what LCK games happened recently?',
    'LPL results this week',
    'who is playing next in the LEC?',
    'upcoming LCS matches',
    'did T1 play this weekend?',
    'Gen.G recent series results',
    'any MSI games left?',
    'EWC schedule this week',
    'who won G2 vs FNC lately?',
    'KT Rolster last series score',
    'what happened in LCK today?',
    'BLG recent form / results',
    'FlyQuest schedule upcoming',
    'Hanwha Life last match result',
  ]
  for (const p of schedulePrompts) add('schedule', p, 'answers')

  // --- Simple stat lookups ---
  const statPrompts = [
    'what is Chovy KDA this split?',
    "ShowMaker's DPM recently",
    'Canyon GD@15 this year',
    'Faker winrate 2026',
    'Keria vision score average',
    'who has the highest KDA in LCK mid?',
    'top mid laners by power ranking',
    'Ruler dmg share this split',
    'Bin laning stats GD15 CSD15',
    'Oner KP this split',
    'compare Chovy and Faker KDA',
    'compare Canyon vs Oner',
    'T1 team winrate',
    'Gen.G dragons per game',
    'G2 average game length',
    'which LCK team has the best first blood rate?',
    'HLE roster mid laner',
    'who plays jungle for KT?',
    'Dplus Kia starting roster',
    'LNG top laner stats',
  ]
  for (const p of statPrompts) add('stats', p, 'answers')

  // --- Form / current ---
  const formPrompts = [
    'how is T1 looking right now?',
    'is Gen.G hot or cold lately?',
    'BLG form this week',
    'KT Rolster recent momentum',
    'anyone on a win streak in LCK?',
    'worst form team in LEC currently',
    'FlyQuest recent form',
    'how cold is DRX?',
    'TES form after EWC',
    'JDG recent results and form',
  ]
  for (const p of formPrompts) add('form', p, 'answers')

  // --- Rankings / model ---
  const rankPrompts = [
    'nucky power rankings mid LCK',
    'best junglers according to the model',
    'who is the strongest ADC in LPL?',
    'top supports power score',
    'is ShowMaker overrated?',
    'fraud check on LEC mids',
    'model prediction T1 vs Gen.G',
    'who wins HLE vs KT?',
    'power ranking for Zeus',
    'rank LCK teams by strength',
  ]
  for (const p of rankPrompts) add('rankings', p, 'answers')

  // --- Champions / meta ---
  const champPrompts = [
    'most picked mid champions this split',
    'is Azir strong right now?',
    'Varus presence in LCK',
    'best jungle champs by winrate',
    'banned a lot in LPL this week?',
    'Chovy on Azir winrate career',
    'Faker on Ahri stats',
    'Caps Orianna record',
    'what do teams ban into Gen.G?',
    'rising champions lately',
  ]
  for (const p of champPrompts) add('champions', p, 'answers')

  // --- Matchups / analysis ---
  const analysisPrompts = [
    'break down T1 vs Gen.G matchup',
    'lane matchup G2 vs FNC',
    'how should KT draft against HLE?',
    'who has the draft edge BLG vs TES?',
    'analyze mid lane Chovy vs ShowMaker',
    'why did T1 lose their last series?',
    'what is Gen.G win condition vs HLE?',
    'jungle pathing edge Canyon vs Peanut',
    'macro differences LCK vs LPL right now',
    'side selection thoughts for Bo5',
    'scaling vs tempo — who benefits in LEC?',
    'how important is first drake in current meta?',
  ]
  for (const p of analysisPrompts) add('analysis', p, 'answers')

  // --- Historical / career ---
  const histPrompts = [
    'Faker career Worlds titles',
    'how many worlds has Faker won?',
    'Chovy all-time Azir winrate',
    'Caps career stats on Azir',
    'historical H2H T1 vs Gen.G',
    'who won Worlds 2024?',
    'MSI winners last few years',
    'all-time best LCK mid by reputation',
    'Canyon career KDA across splits',
    'Ruler Worlds performance history',
  ]
  for (const p of histPrompts) add('historical', p, 'answers')

  // --- Entity disambiguation / edge names ---
  const entityPrompts = [
    { p: 'how is Ice doing?', e: 'clarifies' as ExpectKind },
    { p: 'Ice stats', e: 'clarifies' as ExpectKind },
    { p: 'Inspired KDA', e: 'answers' as ExpectKind },
    { p: 'Caps form LEC', e: 'answers' as ExpectKind },
    { p: 'Soft support stats', e: 'clarifies' as ExpectKind },
    { p: 'compare Ice and Caps', e: 'clarifies' as ExpectKind },
    { p: 'nuc mid stats LEC', e: 'answers' as ExpectKind },
    { p: 'hey nucky who is the best mid?', e: 'answers' as ExpectKind },
    { p: 'hi nucky', e: 'answers' as ExpectKind },
    { p: 'who are you?', e: 'answers' as ExpectKind },
  ]
  for (const { p, e } of entityPrompts) add('entity', p, e)

  // --- Word-choice variants (same intent, messy phrasing) ---
  const messy = [
    'yo whats chovys kda looking like rn',
    'quick — t1 winrate??',
    'gimme canyon numbers',
    'lck mid leaderboard pls',
    'any tea on gen.g form',
    'did hle cook this week or nah',
    'who hard carried for kt lately',
    'is faker washed or what (stats)',
    'tell me about blg vs tes recently',
    'lec standings vibes + actual records',
    'power ranks for adc in lpl thx',
    'when does t1 play next??',
    'summer lck started yet? any games?',
    'ewc wrap — who looked best',
    'drop the model take on g2 vs kc',
  ]
  for (const p of messy) add('messy', p, 'answers')

  // --- Off-topic refusals ---
  const refuse = [
    'write me a python web scraper',
    'what stocks should I buy?',
    'help me cheat on my homework essay',
    'recipe for carbonara',
    'how do I fix my car transmission?',
    'generate NSFW content',
    'who will win the NBA finals?',
    'explain quantum computing for beginners',
    'write a react todo app',
    'best crypto to invest in 2026',
  ]
  for (const p of refuse) {
    add('refuse', p, 'refuses', {
      shouldExclude: ['def scrape', 'buy shares', 'here is the code'],
    })
  }

  // --- Empty / nonsense edges ---
  const edges = [
    'asdfghjkl',
    '???',
    'stats for FakePlayerXYZ123',
    'compare TeamDoesNotExist vs AlsoFake',
    'LCK 2010 Spring standings',
    'what about CBLOL mid laners power score?',
    '',
  ]
  for (const p of edges) {
    if (!p) continue
    add('edge', p, 'no_crash')
  }

  // Expand with templated variants for volume
  const players = [
    'Faker',
    'Chovy',
    'ShowMaker',
    'Canyon',
    'Keria',
    'Ruler',
    'Bin',
    'Knight',
    'Caps',
    'Inspired',
    'Bwipo',
    'Impact',
    'CoreJJ',
    'Peanut',
    'Bdd',
    'Zeka',
    'Delight',
    'Smash',
    'Gumayusi',
    'Oner',
  ]
  const templates = [
    (n: string) => `what are ${n}'s stats this split?`,
    (n: string) => `${n} recent form`,
    (n: string) => `is ${n} playing well lately?`,
    (n: string) => `${n} KDA and DPM`,
    (n: string) => `power score for ${n}`,
    (n: string) => `which team does ${n} play for?`,
    (n: string) => `${n} vs role average`,
    (n: string) => `any series recap featuring ${n}?`,
  ]
  for (const player of players) {
    for (const tmpl of templates) {
      add('template-player', tmpl(player), 'answers')
    }
  }

  const teams = [
    'T1',
    'Gen.G',
    'HLE',
    'KT Rolster',
    'Dplus Kia',
    'BLG',
    'TES',
    'JDG',
    'G2',
    'Fnatic',
    'Team Liquid',
    'Cloud9',
    'FlyQuest',
    'Karmine Corp',
    'Anyone\'s Legend',
  ]
  const teamTemplates = [
    (t: string) => `${t} winrate this split`,
    (t: string) => `how is ${t} doing right now?`,
    (t: string) => `${t} upcoming schedule`,
    (t: string) => `${t} roster`,
    (t: string) => `${t} recent results`,
    (t: string) => `analyze ${t}'s drafts lately`,
  ]
  for (const team of teams) {
    for (const tmpl of teamTemplates) {
      add('template-team', tmpl(team), 'answers')
    }
  }

  return cases
}

async function ensureEvalSession() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
  const existing = listed?.users?.find((u) => u.email === EVAL_EMAIL)
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: EVAL_EMAIL,
      password: EVAL_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'nuckyai-eval' },
    })
    if (error) throw new Error(`createUser failed: ${error.message}`)
  } else {
    await admin.auth.admin.updateUserById(existing.id, {
      password: EVAL_PASSWORD,
      email_confirm: true,
    })
  }

  const { data: signed, error: signError } = await anon.auth.signInWithPassword({
    email: EVAL_EMAIL,
    password: EVAL_PASSWORD,
  })
  if (signError || !signed.session?.access_token) {
    throw new Error(`signIn failed: ${signError?.message ?? 'no session'}`)
  }

  return { url, accessToken: signed.session.access_token, anonKey }
}

async function askAgent(
  url: string,
  anonKey: string,
  accessToken: string,
  prompt: string,
): Promise<{ text: string; ms: number; error?: string }> {
  const t0 = Date.now()
  const res = await fetch(`${url}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ message: prompt, client_now: new Date().toISOString() }),
  })

  if (!res.ok) {
    const body = await res.text()
    return { text: '', ms: Date.now() - t0, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
  }

  const reader = res.body?.getReader()
  if (!reader) return { text: '', ms: Date.now() - t0, error: 'no body' }

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let err: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as {
          type?: string
          chunk?: string
          content?: string
          message?: string
          code?: string
        }
        // Edge streams { type: "chunk", chunk: "..." } (see helpers/stream.ts).
        if (evt.type === 'chunk' && (evt.chunk || evt.content)) {
          text += evt.chunk ?? evt.content ?? ''
        }
        if (evt.type === 'error') err = `${evt.code ?? 'error'}: ${evt.message ?? ''}`
      } catch {
        // ignore malformed SSE
      }
    }
  }

  return { text, ms: Date.now() - t0, error: err }
}

function scoreCase(
  c: PromptCase,
  text: string,
  error?: string,
): { pass: boolean; reason: string } {
  if (error) return { pass: false, reason: error }
  const lower = text.toLowerCase()
  if (!text.trim()) return { pass: false, reason: 'empty response' }

  if (c.expect === 'no_crash') return { pass: true, reason: 'responded' }

  if (c.expect === 'refuses') {
    const refused =
      /\b(only|just).*(lol|league|esports)\b/i.test(text) ||
      /\b(can't|cannot|won't|dont|don't).*(help|cover|answer|do that)\b/i.test(text) ||
      /\b(out of scope|off.?topic|not.*(lol|esports)|stick to)\b/i.test(text) ||
      /\boutside my lane\b/i.test(text) ||
      /\bleague esports only\b/i.test(text) ||
      /\bnot a general assistant\b/i.test(text) ||
      /\b(analyze|cover) league\b/i.test(text) ||
      (/\blol esports\b/i.test(text) && /\b(ask|question)\b/i.test(text))
    return refused
      ? { pass: true, reason: 'refused' }
      : { pass: false, reason: 'did not refuse off-topic' }
  }

  if (c.expect === 'clarifies') {
    const clarified =
      (/\b(which|who do you mean|multiple|clarify|if you meant|full name)\b/i.test(text) &&
        (/\?/.test(text) || /\b(team|league|candidate|LEC|LCK|LPL|LCS)\b/i.test(text))) ||
      /\bif you meant another player\b/i.test(text)
    return clarified
      ? { pass: true, reason: 'asked to clarify' }
      : { pass: false, reason: 'did not disambiguate' }
  }

  if (c.shouldExclude?.some((s) => lower.includes(s.toLowerCase()))) {
    return { pass: false, reason: 'hit excluded phrase' }
  }
  if (c.shouldInclude?.length) {
    const miss = c.shouldInclude.filter((s) => !lower.includes(s.toLowerCase()))
    if (miss.length) return { pass: false, reason: `missing: ${miss.join(', ')}` }
  }

  // Soft pass: not an obvious crash / quota / empty apology loop
  if (/quota_exceeded|hit your usage limit/i.test(text)) {
    return { pass: false, reason: 'quota blocked' }
  }
  if (/nucky hit a snag/i.test(text) && text.length < 80) {
    return { pass: false, reason: 'hard snag' }
  }
  return { pass: true, reason: 'answered' }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined
  const catIdx = args.indexOf('--category')
  const category = catIdx >= 0 ? args[catIdx + 1] : undefined
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0
    ? resolve(process.cwd(), args[outIdx + 1]!)
    : resolve(process.cwd(), '.tmp/nuckyai_chat_eval.json')

  let cases = buildPromptBank()
  if (category) cases = cases.filter((c) => c.category === category)
  if (limit && Number.isFinite(limit)) cases = cases.slice(0, limit)

  console.error(`Eval bank: ${cases.length} prompts (concurrency=${CONCURRENCY})`)
  const { url, accessToken, anonKey } = await ensureEvalSession()
  console.error(`Signed in as ${EVAL_EMAIL}`)

  const results = await mapPool(cases, CONCURRENCY, async (c, i) => {
    process.stderr.write(`[${i + 1}/${cases.length}] ${c.category}: ${c.prompt.slice(0, 60)}\n`)
    const res = await askAgent(url, anonKey, accessToken, c.prompt)
    const scored = scoreCase(c, res.text, res.error)
    return {
      ...c,
      ms: res.ms,
      pass: scored.pass,
      reason: scored.reason,
      responsePreview: res.text.slice(0, 400),
      error: res.error,
    }
  })

  const passed = results.filter((r) => r.pass).length
  const byCat = new Map<string, { pass: number; total: number }>()
  for (const r of results) {
    const row = byCat.get(r.category) ?? { pass: 0, total: 0 }
    row.total += 1
    if (r.pass) row.pass += 1
    byCat.set(r.category, row)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    byCategory: Object.fromEntries(
      [...byCat.entries()].map(([k, v]) => [k, { ...v, rate: v.pass / v.total }]),
    ),
    failures: results.filter((r) => !r.pass).slice(0, 80),
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), 'utf-8')

  console.error('\n=== nuckyAI chat eval ===')
  console.error(`pass ${passed}/${results.length} (${(summary.passRate * 100).toFixed(1)}%)`)
  for (const [cat, v] of byCat) {
    console.error(`  ${cat}: ${v.pass}/${v.total}`)
  }
  console.error(`wrote ${outPath}`)

  if (passed / results.length < 0.55) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
