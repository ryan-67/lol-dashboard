/**
 * One-off: probe Cito /results for tier-1 leagues since 2026-07-25.
 * Compare against known OE lag (shards stamped ~Jul 29 → data through ~Jul 28).
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import { config } from 'dotenv'
import { CitoClient } from './client.ts'
import type { CitoScheduleEvent } from './types.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(ROOT, '.env') })

const leagues = [
  { id: 'lol-lck', name: 'LCK' },
  { id: 'lol-lpl', name: 'LPL' },
  { id: 'lol-lec', name: 'LEC' },
  { id: 'lol-lcs', name: 'LCS' },
] as const

function eventsFromPayload(payload: unknown): CitoScheduleEvent[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as {
    data?: { events?: CitoScheduleEvent[] } | CitoScheduleEvent[]
    events?: CitoScheduleEvent[]
  }
  if (Array.isArray(p.data)) return p.data as CitoScheduleEvent[]
  if (Array.isArray(p.data?.events)) return p.data.events
  if (Array.isArray(p.events)) return p.events
  if (Array.isArray(payload)) return payload as CitoScheduleEvent[]
  return []
}

function rowFromEvent(ev: CitoScheduleEvent, league: string) {
  const teams = ev.teams ?? []
  const a = teams[0]?.name ?? teams[0]?.code ?? teams[0]?.slug ?? 'TBD'
  const b = teams[1]?.name ?? teams[1]?.code ?? teams[1]?.slug ?? 'TBD'
  const scoreA = teams[0]?.score
  const scoreB = teams[1]?.score
  return {
    league,
    start: ev.startTime ?? null,
    day: ev.startTime ? ev.startTime.slice(0, 10) : null,
    a,
    b,
    state: (ev.state ?? '').toLowerCase(),
    score:
      typeof scoreA === 'number' && typeof scoreB === 'number' ? `${scoreA}-${scoreB}` : null,
    block: ev.blockName ?? null,
    matchId: ev.matchId ?? null,
  }
}

async function main() {
  const apiKey = process.env.CITO_API_KEY
  if (!apiKey) throw new Error('CITO_API_KEY missing')
  const client = new CitoClient({ apiKey })
  const since = '2026-07-25'
  const all: ReturnType<typeof rowFromEvent>[] = []
  const errors: { league: string; source: string; error: string }[] = []

  for (const league of leagues) {
    for (const source of ['results', 'schedule'] as const) {
      try {
        const payload = await client.paced(() =>
          client.get(`/lol/leagues/${league.id}/${source}`),
        )
        const events = eventsFromPayload(payload)
        const mapped = events
          .map((ev) => rowFromEvent(ev, league.name))
          .filter((r) => !r.day || r.day >= since)
        console.log(
          `${league.name} ${source}: ${events.length} total, ${mapped.length} since ${since}`,
        )
        if (source === 'results') all.push(...mapped)
        else if (source === 'schedule') {
          // keep completed/in_progress from schedule if results empty
          const useful = mapped.filter((r) =>
            ['completed', 'complete', 'finished', 'inprogress', 'in_progress'].includes(r.state),
          )
          if (!all.some((r) => r.league === league.name)) all.push(...useful)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`${league.name} ${source} ERROR: ${msg}`)
        errors.push({ league: league.name, source, error: msg })
      }
    }
  }

  all.sort((a, b) => String(a.start).localeCompare(String(b.start)))

  // Expected from public reporting (crosscheck targets)
  const expected = [
    { day: '2026-07-29', league: 'LCK', hint: 'KT vs T1 / NS vs KRX' },
    { day: '2026-07-29', league: 'LPL', hint: 'LGD vs BLG' },
    { day: '2026-07-30', league: 'LCK', hint: 'DK vs HLE / FearX vs DNS' },
    { day: '2026-07-31', league: 'LCK', hint: 'T1 vs GEN / DRX vs BRO' },
    { day: '2026-07-31', league: 'LEC', hint: 'Summer week 2' },
  ]

  const byDay = new Map<string, typeof all>()
  for (const r of all) {
    const k = `${r.day ?? '?'}|${r.league}`
    const list = byDay.get(k) ?? []
    list.push(r)
    byDay.set(k, list)
  }

  const coverage = expected.map((e) => {
    const hits = all.filter(
      (r) =>
        r.league === e.league &&
        r.day === e.day &&
        (r.state.includes('complete') || r.state.includes('finish') || r.score),
    )
    return { ...e, citoHits: hits.length, samples: hits.slice(0, 4) }
  })

  const out = {
    probedAt: new Date().toISOString(),
    since,
    oeShardNote: 'local oe_slices_2026_*.json LastWriteTime ~2026-07-29; Hub shows data through Jul 28',
    citoScheduleCacheNote: 'public/data/cito_schedule_cache.json LastWriteTime ~2026-07-10 (stale)',
    totalRowsSince: all.length,
    errors,
    coverage,
    rows: all,
  }

  const outPath = path.join(ROOT, '.tmp', 'cito-current-audit.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log('\n=== COVERAGE vs expected this week ===')
  for (const c of coverage) {
    console.log(
      `${c.day} ${c.league}: citoHits=${c.citoHits} (${c.hint})`,
      c.samples.map((s) => `${s.a} ${s.score ?? '?'} ${s.b}`).join(' | ') || '(none)',
    )
  }
  console.log(`\nwrote ${outPath} (${all.length} rows)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
