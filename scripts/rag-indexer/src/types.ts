export type DocumentSource = 'liquipedia' | 'patch_notes'

export interface ScrapedPage {
  source: DocumentSource
  sourceUrl: string
  title: string
  text: string
  contextHeader: string
  scrapedAt: string
}

export interface TextChunk {
  source: DocumentSource
  sourceUrl: string
  title: string
  contextHeader: string
  chunkIndex: number
  content: string
  scrapedAt: string
}

export interface DocumentUpsertRow {
  content: string
  embedding: number[]
  source: DocumentSource
  source_url: string
  chunk_index: number
  title: string
  metadata: {
    source_url: string
    title: string
    scraped_at: string
    chunk_index: number
  }
}
