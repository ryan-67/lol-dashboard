#!/usr/bin/env node
/**
 * Generate AI recap lines for new series in the past 30 days and upsert to Supabase.
 * Run after OE ingest/seed in CI or locally.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 * Optional:
 *   RECAP_LLM_MODEL, RECAP_YEAR, RECAP_DRY_RUN=1, RECAP_REGENERATE=1
 *   RECAP_PLAYOFFS_2026_SPRING=1 — bulk backfill for 2026 Spring playoffs only (all leagues)
 */
import {
  collectSeriesBriefs,
  is2026SpringPlayoffGame,
  isRecentCompletedGame,
  type SeriesBrief,
} from '../../src/lib/weeklyRecap.ts'
import { getHubWindow, windowToWeeklyRecapWindow } from '../../src/lib/weeklyWindow.ts'
import {
  createServiceClient,
  currentYear,
  deleteConflictingRecapRows,
  fetchExistingRecapMeta,
  loadTier1Data,
  loadTier1DataFromSupabase,
  upsertRecapRow,
} from './db.ts'
import { fetchRecapRagBundle } from './rag.ts'
import { generateAiRecapLine, briefToTemplateLine } from './compose.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { DEFAULT_RECAP_MODEL } from './openrouter.ts'
import { fetchGlobalPowerRanks } from './powerRankings.ts'

function dedupeBriefs(briefs: SeriesBrief[]): SeriesBrief[] {
  const map = new Map<string, SeriesBrief>()
  for (const b of briefs) map.set(b.seriesId, b)
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.seriesId.localeCompare(b.seriesId))
}

async function main(): Promise<void> {
  const dryRun = process.env.RECAP_DRY_RUN === '1'
  const forceRegenerate = process.env.RECAP_REGENERATE === '1'
  const bulkPlayoffs2026 = process.env.RECAP_PLAYOFFS_2026_SPRING === '1'
  const year = currentYear()
  const client = dryRun ? null : createServiceClient()

  console.log(`Loading tier-1 OE data for ${year}...`)
  let { players, teams } = await loadTier1Data(client, year)

  const citoKey = process.env.CITO_API_KEY?.trim() ?? ''
  const powerRanks = citoKey ? await fetchGlobalPowerRanks(citoKey) : new Map()

  let briefs: SeriesBrief[] = []

  if (bulkPlayoffs2026) {
    console.log('Mode: 2026 Spring playoffs bulk backfill (all leagues)')
    briefs = collectSeriesBriefs(players, teams, null, {
      gameFilter: is2026SpringPlayoffGame,
      powerRanks,
    })
  } else {
    const window = getHubWindow(players, 'monthly')
    if (!window) {
      console.log('No game log dates — nothing to recap.')
      return
    }

    let recapWindow = windowToWeeklyRecapWindow(window)
    briefs = collectSeriesBriefs(players, teams, recapWindow, { powerRanks })

    if (!briefs.length && client && process.env.RECAP_FROM_SUPABASE !== '1') {
      console.log('No series from local shards — loading fresh oe_slices from Supabase...')
      ;({ players, teams } = await loadTier1DataFromSupabase(client, year))
      const retryWindow = getHubWindow(players, 'monthly')
      if (retryWindow) {
        recapWindow = windowToWeeklyRecapWindow(retryWindow)
        briefs = collectSeriesBriefs(players, teams, recapWindow, { powerRanks })
      }
    }

    const recentBriefs = collectSeriesBriefs(players, teams, null, {
      gameFilter: (g) => isRecentCompletedGame(g, 14),
      powerRanks,
    })
    briefs = dedupeBriefs([...briefs, ...recentBriefs])
    console.log(`Monthly window ${window.label}: ${briefs.length} series (incl. recent completions)`)
  }

  if (!briefs.length) return

  const ids = briefs.map((b) => b.seriesId)
  const existingMeta = client ? await fetchExistingRecapMeta(client, ids) : new Map<string, string | null>()
  const pending = briefs.filter((b) => {
    if (forceRegenerate) return true
    const model = existingMeta.get(b.seriesId)
    if (model === undefined) return true
    return model === 'template-fallback'
  })
  console.log(
    `${pending.length} series to generate (${existingMeta.size} cached` +
      `${forceRegenerate ? ', force regenerate' : ''})`,
  )

  if (!pending.length) return

  console.log(`Using model: ${DEFAULT_RECAP_MODEL}`)

  for (const brief of pending) {
    console.log(`\n→ ${brief.facts.winner} vs ${brief.facts.loser} (${brief.facts.score}) [${brief.seriesId}]`)
    try {
      const ragContext = client ? await fetchRecapRagBundle(client, brief) : ''
      if (ragContext) console.log(`  RAG (${ragContext.split('---').length} chunks): ${ragContext.slice(0, 140)}...`)

      let line = briefToTemplateLine(brief)
      let plainText = recapLineToText(line)
      let model = 'template-fallback'

      try {
        const ai = await generateAiRecapLine(brief, ragContext)
        line = ai.line
        plainText = ai.plainText
        model = ai.model
      } catch (aiErr) {
        console.warn(
          '  AI generation failed, using template:',
          aiErr instanceof Error ? aiErr.message : aiErr,
        )
      }

      console.log(`  ${plainText}`)

      if (dryRun || !client) continue

      await upsertRecapRow(client, {
        series_id: brief.seriesId,
        league: brief.league,
        series_date: brief.date,
        team_a: brief.teamA,
        team_b: brief.teamB,
        winner: brief.facts.winner,
        score: brief.facts.score,
        segments: line.segments,
        plain_text: plainText,
        facts_json: brief.facts,
        rag_context: ragContext || null,
        model,
      })
      const removed = await deleteConflictingRecapRows(client, {
        series_id: brief.seriesId,
        series_date: brief.date,
        team_a: brief.teamA,
        team_b: brief.teamB,
      })
      console.log(removed ? `  saved (removed ${removed} stale series_id row(s)).` : '  saved.')
    } catch (err) {
      console.error('  FAILED:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
