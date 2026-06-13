import { teamSearchAbbreviation } from './entities/entityMap'
import { resolveTeamCanonicalName } from './entities/slugs'

const FILLER_WORDS = new Set(['esports', 'gaming', 'team', 'life', 'of', 'the'])

export function recapTeamTag(name: string): string {
  const canonical = resolveTeamCanonicalName(name)
  const mapped = teamSearchAbbreviation(canonical)
  if (mapped !== canonical && mapped.length <= 6) return mapped.toUpperCase()

  const words = canonical.replace(/'/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0]!.toUpperCase()
  if (words[0] && words[0].length <= 4) return words[0]!.toUpperCase()

  const significant = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()))
  if (significant.length >= 2) {
    return significant.map((w) => w[0]?.toUpperCase() ?? '').join('')
  }
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('') || canonical.toUpperCase()
}
