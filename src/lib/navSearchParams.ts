/** Search params safe for dashboard nav — strips nuckyAI-only keys on other routes. */
export function navSearchForPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  if (pathname !== '/nuckyai') {
    params.delete('conversation_id')
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function stripNuckyAiSearchParams(search: string): string {
  const params = new URLSearchParams(search)
  if (!params.has('conversation_id')) return search
  params.delete('conversation_id')
  const query = params.toString()
  return query ? `?${query}` : ''
}
