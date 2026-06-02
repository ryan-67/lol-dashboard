import {
  CHUNK_MAX,
  CHUNK_MIN,
  CHUNK_OVERLAP,
  CHUNK_TARGET,
} from './config.js'
import type { ScrapedPage, TextChunk } from './types.js'

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function takeTail(text: string, size: number): string {
  if (text.length <= size) return text
  return text.slice(text.length - size)
}

function buildChunkContent(header: string, body: string): string {
  const prefix = `${header}\n\n`
  return `${prefix}${body}`.trim()
}

export function chunkPage(page: ScrapedPage): TextChunk[] {
  const paragraphs = splitParagraphs(page.text)
  if (!paragraphs.length) return []

  const chunks: TextChunk[] = []
  let buffer = ''
  let chunkIndex = 0

  const flush = () => {
    const body = buffer.trim()
    if (!body) return
    chunks.push({
      source: page.source,
      sourceUrl: page.sourceUrl,
      title: page.title,
      contextHeader: page.contextHeader,
      chunkIndex,
      content: buildChunkContent(page.contextHeader, body),
      scrapedAt: page.scrapedAt,
    })
    chunkIndex += 1
    buffer = takeTail(body, CHUNK_OVERLAP)
  }

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (candidate.length <= CHUNK_MAX) {
      buffer = candidate
      if (buffer.length >= CHUNK_TARGET) {
        flush()
      }
      continue
    }

    if (buffer.length >= CHUNK_MIN) {
      flush()
      buffer = paragraph
      if (buffer.length >= CHUNK_TARGET) {
        flush()
      }
      continue
    }

    // Hard-split an oversized paragraph while keeping overlap.
    let start = 0
    while (start < paragraph.length) {
      const slice = paragraph.slice(start, start + CHUNK_MAX)
      buffer = buffer ? `${buffer}\n\n${slice}` : slice
      flush()
      start += CHUNK_MAX - CHUNK_OVERLAP
    }
    buffer = ''
  }

  if (buffer.trim()) {
    flush()
  }

  return chunks
}

export function chunkPages(pages: ScrapedPage[]): TextChunk[] {
  return pages.flatMap((page) => chunkPage(page))
}
