import { TEAM_ENTITIES } from './entityMap'

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function playerSlug(name: string, team?: string, league?: string): string {
  const base = slugify(name)
  if (!team || !league) return base
  return `${base}-${slugify(team)}-${league.toLowerCase()}`
}

export function parsePlayerSlug(slug: string): { nameHint: string; teamHint?: string; leagueHint?: string } {
  const parts = slug.split('-')
  if (parts.length < 3) {
    return { nameHint: slug.replace(/-/g, ' ') }
  }
  const leagueHint = parts[parts.length - 1]?.toUpperCase()
  const teamHint = parts.slice(1, -1).join(' ')
  if (['LCK', 'LPL', 'LEC', 'LCS'].includes(leagueHint)) {
    return { nameHint: parts[0] ?? slug, teamHint, leagueHint }
  }
  return { nameHint: slug.replace(/-/g, ' ') }
}

export function teamSlugFromName(name: string): string {
  const mapped = TEAM_ENTITIES.find(
    (t) =>
      t.oeNames.some((n) => n.toLowerCase() === name.toLowerCase()) ||
      t.canonicalName.toLowerCase() === name.toLowerCase(),
  )
  return mapped?.slug ?? slugify(name)
}

export function resolveTeamCanonicalName(oeName: string): string {
  const lower = oeName.toLowerCase()
  for (const team of TEAM_ENTITIES) {
    if (team.canonicalName.toLowerCase() === lower) return team.canonicalName
    if (team.oeNames.some((n) => n.toLowerCase() === lower)) return team.canonicalName
    if (team.abbreviations.some((a) => a.toLowerCase() === lower)) return team.canonicalName
  }
  return oeName
}

export function oeNamesForTeamSlug(slug: string): string[] {
  const team = TEAM_ENTITIES.find((t) => t.slug === slug)
  if (!team) return []
  return [...new Set([team.canonicalName, ...team.oeNames])]
}

export function teamMatchesCanonical(oeTeamName: string, canonicalOrSlug: string): boolean {
  const slug = slugify(canonicalOrSlug)
  const names = oeNamesForTeamSlug(slug)
  if (names.length) {
    return names.some((n) => n.toLowerCase() === oeTeamName.toLowerCase())
  }
  return slugify(oeTeamName) === slug || oeTeamName.toLowerCase() === canonicalOrSlug.toLowerCase()
}

export function championSlug(name: string): string {
  return slugify(name)
}
