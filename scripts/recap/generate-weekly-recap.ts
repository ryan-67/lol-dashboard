#!/usr/bin/env node
/**
 * Generate AI weekly recap lines for new series and upsert to Supabase.
 * Run after OE ingest/seed in CI or locally.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 * Optional: RECAP_LLM_MODEL, RECAP_YEAR, RECAP_DRY_RUN=1
 */
import { collectSeriesBriefs } from '../../src/lib/weeklyRecap.ts'
import { getWeeklyWindow, windowToWeeklyRecapWindow } from '../../src/lib/weeklyWindow.ts'
import {
  createServiceClient,
  currentYear,
  fetchExistingSeriesIds,
  loadTier1DataFromShards,
  upsertRecapRow,
} from './db.ts'
import { fetchRagContext, buildRagQuery } from './rag.ts'
import { generateAiRecapLine, briefToTemplateLine } from './compose.ts'
import { recapLineToText } from '../../src/lib/weeklyRecap.ts'
import { DEFAULT_RECAP_MODEL } from './openrouter.ts'

async function main(): Promise<void> {
  const dryRun = process.env.RECAP_DRY_RUN === '1'
  const year = currentYear()
  const client = dryRun ? null : createServiceClient()

  console.log(`Loading tier-1 OE shards for ${year}...`)
  const { players, teams } = loadTier1DataFromShards(year)
  const window = getWeeklyWindow(players, year, 'ALL')
  if (!window) {
    console.log('No game log dates — nothing to recap.')
    return
  }

  const recapWindow = windowToWeeklyRecapWindow(window)
  const briefs = collectSeriesBriefs(players, teams, recapWindow)
  console.log(`Weekly window ${window.label}: ${briefs.length} series`)

  if (!briefs.length) return

  const ids = briefs.map((b) => b.seriesId)
  const existing = client ? await fetchExistingSeriesIds(client, ids) : new Set<string>()
  const pending = briefs.filter((b) => !existing.has(b.seriesId))
  console.log(`${pending.length} new series to generate (${existing.size} already cached)`)

  if (!pending.length) return

  console.log(`Using model: ${DEFAULT_RECAP_MODEL}`)

  for (const brief of pending) {
    console.log(`\n→ ${brief.facts.winner} vs ${brief.facts.loser} (${brief.facts.score}) [${brief.seriesId}]`)
    try {
      const ragQuery = buildRagQuery(
        brief.facts.winner,
        brief.facts.loser,
        brief.league,
        brief.facts.score,
        brief.date,
      )
      const ragContext = client ? await fetchRagContext(client, ragQuery, brief.league) : ''
      if (ragContext) console.log(`  RAG: ${ragContext.slice(0, 120)}...`)

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
