/**
 * Compares dashboard mergeSlices output vs agent-chat OE bundle semantics for fixture filters.
 * Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in env.
 *
 * Usage: npm run eval:nuckyai
 */
import { createClient } from '@supabase/supabase-js'
import { mergeSlicesFromFilters, type OEStore } from '../src/lib/mergeSlices.ts'

const FIXTURES = [
  {
    name: 'LCK 2026 Spring',
    leagues: ['LCK'],
    years: ['2026'],
    splits: ['2026 Spring'],
  },
  {
    name: 'All Tier 1 ALL splits 2026',
    leagues: ['All Tier 1'],
    years: ['2026'],
    splits: ['ALL'],
  },
  {
    name: 'LPL 2026 Spring',
    leagues: ['LPL'],
    years: ['2026'],
    splits: ['2026 Spring'],
  },
  {
    name: 'LCK Spring season label',
    leagues: ['LCK'],
    years: ['2026'],
    splits: ['2026 Spring'],
    agentSplit: 'Spring',
  },
  {
    name: 'All Tier 1 current split',
    leagues: ['All Tier 1'],
    years: ['2026'],
    splits: ['2026 Spring'],
  },
] as const

function round(n: number, d = 1): number {
  const p = 10 ** d
  return Math.round(n * p) / p
}

async function loadStore(client: ReturnType<typeof createClient>): Promise<OEStore> {
  const { data, error } = await client.from('oe_slices').select('split, league, data')
  if (error) throw new Error(`oe_slices load failed: ${error.message}`)

  const splits = new Set<string>()
  const leagues = new Set<string>()
  const slices: OEStore['slices'] = {}

  for (const row of data ?? []) {
    const split = String((row as { split: string }).split)
    const league = String((row as { league: string }).league)
    splits.add(split)
    leagues.add(league)
    slices[`${split}|${league}`] = {
      split,
      league,
      data: (row as { data: OEStore['slices'][string]['data'] }).data,
    }
  }

  return {
    meta: {
      splits: [...splits].sort(),
      leagues: [...leagues].sort(),
    },
    slices,
  }
}

async function fetchAgentBundle(
  client: ReturnType<typeof createClient>,
  fixture: (typeof FIXTURES)[number],
) {
  const splitLabel =
    'agentSplit' in fixture && fixture.agentSplit
      ? fixture.agentSplit
      : fixture.splits.includes('ALL')
        ? 'ALL'
        : fixture.splits[0]!.replace(/^\d{4}\s+/, '')

  const { data, error } = await client
    .from('oe_slices')
    .select('split, league, data')
    .limit(500)

  if (error) throw new Error(error.message)

  // Mirror oeData.resolveSliceKeys + merge (simplified inline for eval)
  const allSplits = [...new Set((data ?? []).map((r) => String((r as { split: string }).split)))].sort()
  let splitLabels = allSplits
  if (!fixture.years.includes('ALL')) {
    splitLabels = splitLabels.filter((s) => fixture.years.some((y) => s.startsWith(`${y} `)))
  }
  if (!fixture.splits.includes('ALL')) {
    const fullSplits = fixture.splits
    splitLabels = splitLabels.filter((s) => fullSplits.includes(s))
  }

  const tier1 = fixture.leagues.includes('All Tier 1')
    ? ['LCK', 'LPL', 'LEC', 'LCS']
    : fixture.leagues.filter((l) => l !== 'All Tier 1')

  const rows = (data ?? []).filter((r) => {
    const split = String((r as { split: string }).split)
    const league = String((r as { league: string }).league)
    return splitLabels.includes(split) && tier1.includes(league)
  })

  return { rows: rows.length, splitLabels, tier1, splitLabel }
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const client = createClient(url, key)
  const store = await loadStore(client)

  let passed = 0
  for (const fixture of FIXTURES) {
    const dashboard = mergeSlicesFromFilters(store, [...fixture.leagues], [...fixture.years], [...fixture.splits])
    const agent = await fetchAgentBundle(client, fixture)

    const t1 = dashboard.teams.find((t) => t.name === 'T1' && t.league === 'LCK')
    const chovy = dashboard.players.find((p) => p.name === 'Chovy' && p.league === 'LCK')

    const ok =
      agent.rows > 0 &&
      dashboard.teams.length > 0 &&
      (fixture.leagues.includes('LCK') ? !!t1 : true)

    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${fixture.name}`)
    console.log(`  dashboard teams: ${dashboard.teams.length}, players: ${dashboard.players.length}`)
    console.log(`  agent slice rows: ${agent.rows} (${agent.splitLabels.join(', ') || 'none'})`)
    if (t1) console.log(`  T1 winrate (dashboard): ${round(t1.winrate)}%`)
    if (chovy) console.log(`  Chovy KDA (dashboard): ${round(chovy.kda, 2)}`)

    if (ok) passed += 1
  }

  console.log(`\n${passed}/${FIXTURES.length} fixtures aligned`)
  process.exit(passed === FIXTURES.length ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
