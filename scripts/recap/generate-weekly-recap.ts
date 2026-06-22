#!/usr/bin/env node
/**
 * Generate AI recap lines for new series in the past 30 days and upsert to Supabase.
 * Run after OE ingest/seed in CI or locally.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 * Optional: RECAP_LLM_MODEL, RECAP_YEAR, RECAP_DRY_RUN=1, RECAP_REGENERATE=1
 */
import { collectSeriesBriefs } from '../../src/lib/weeklyRecap.ts'
import { getHubWindow, windowToWeeklyRecapWindow } from '../../src/lib/weeklyWindow.ts'
import {
  createServiceClient,
  currentYear,
  fetchExistingRecapMeta,
  loadTier1Data,
  loadTier1DataFromSupabase,
  upsertRecapRow,
} from './db.ts'
import { fetchRecapRagBundle } from './rag.ts'
import { generateAiRecapLine, briefToTemplateLine } from './compose.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { DEFAULT_RECAP_MODEL } from './openrouter.ts'

async function main(): Promise<void> {
  const dryRun = process.env.RECAP_DRY_RUN === '1'
  const forceRegenerate = process.env.RECAP_REGENERATE === '1'
  const year = currentYear()
  const client = dryRun ? null : createServiceClient()

  console.log(`Loading tier-1 OE data for ${year}...`)
  let { players, teams } = await loadTier1Data(client, year)
  const window = getHubWindow(players, 'monthly')
  if (!window) {
    console.log('No game log dates — nothing to recap.')
    return
  }

  let recapWindow = windowToWeeklyRecapWindow(window)
  let briefs = collectSeriesBriefs(players, teams, recapWindow)

  if (!briefs.length && client && process.env.RECAP_FROM_SUPABASE !== '1') {
    console.log('No series from local shards — loading fresh oe_slices from Supabase...')
    ;({ players, teams } = await loadTier1DataFromSupabase(client, year))
    const retryWindow = getHubWindow(players, 'monthly')
    if (retryWindow) {
      recapWindow = windowToWeeklyRecapWindow(retryWindow)
      briefs = collectSeriesBriefs(players, teams, recapWindow)
    }
  }

  console.log(`Monthly window ${window.label}: ${briefs.length} series`)

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
      console.log('  saved.')
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
