import { DRY_RUN } from './config.js'
import { chunkPages } from './chunk.js'
import { scrapeLiquipedia } from './scrapers/liquipedia.js'
import { scrapePatchNotes } from './scrapers/patch-notes.js'
import { dedupePages } from './utils/url.js'
import type { ScrapedPage, TextChunk } from './types.js'
import { pruneStaleChunks, upsertChunks } from './upsert.js'

function groupChunksBySourceUrl(chunks: TextChunk[]): Map<string, TextChunk[]> {
  const map = new Map<string, TextChunk[]>()
  for (const chunk of chunks) {
    const key = `${chunk.source}::${chunk.sourceUrl}`
    const list = map.get(key) ?? []
    list.push(chunk)
    map.set(key, list)
  }
  return map
}

async function upsertWithPrune(chunks: TextChunk[]): Promise<number> {
  const grouped = groupChunksBySourceUrl(chunks)
  let total = 0

  for (const [, pageChunks] of grouped) {
    const sorted = [...pageChunks].sort((a, b) => a.chunkIndex - b.chunkIndex)
    total += await upsertChunks(sorted)
    const sample = sorted[0]
    if (sample) {
      await pruneStaleChunks(sample.source, sample.sourceUrl, sorted.length)
    }
  }

  return total
}

function summarizePages(label: string, pages: ScrapedPage[]): void {
  const bySource = pages.reduce<Record<string, number>>((acc, page) => {
    acc[page.source] = (acc[page.source] ?? 0) + 1
    return acc
  }, {})
  console.log(`${label}: ${pages.length} page(s) (${JSON.stringify(bySource)})`)
}

async function main(): Promise<void> {
  console.log(`nucky RAG indexer ${DRY_RUN ? '(dry-run)' : ''}`)
  console.log(`Started at ${new Date().toISOString()}`)

  const liquipediaPages = await scrapeLiquipedia()
  const patchPages = await scrapePatchNotes()

  const pages = dedupePages([...liquipediaPages, ...patchPages])
  summarizePages('Scraped total', pages)

  const chunks = chunkPages(pages)
  console.log(`Chunked into ${chunks.length} document chunk(s)`)

  if (!chunks.length) {
    console.warn('No chunks produced; exiting.')
    process.exitCode = 1
    return
  }

  const upserted = await upsertWithPrune(chunks)
  console.log(`${DRY_RUN ? 'Dry-run complete' : 'Indexing complete'}: ${upserted} row(s)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
