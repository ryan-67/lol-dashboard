export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    let path = parsed.pathname.replace(/\/+$/, '')
    if (!path) path = '/'
    parsed.pathname = path
    return parsed.toString()
  } catch {
    return url.replace(/\/+$/, '')
  }
}

export function dedupePages<T extends { sourceUrl: string }>(pages: T[]): T[] {
  const map = new Map<string, T>()
  for (const page of pages) {
    const key = normalizeSourceUrl(page.sourceUrl)
    if (!map.has(key)) {
      map.set(key, { ...page, sourceUrl: key })
    }
  }
  return [...map.values()]
}
