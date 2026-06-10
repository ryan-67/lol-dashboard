import { CHAMPION_DDRAGON, TEAM_ENTITIES, teamSearchAbbreviation } from './entityMap'
import esportsLogos from '../../data/esports-logos.json'
import ddragonChampions from '../../data/ddragon-champions.json'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type DdragonChampionManifest = {
  version: string
  byName: Record<string, string>
  byNormalizedName: Record<string, string>
}

const ddragonManifest = ddragonChampions as DdragonChampionManifest

type EsportsLogoManifest = {
  leagues: Record<string, string>
  teamsByEsportsSlug: Record<string, string>
  teamsAltByEsportsSlug?: Record<string, string>
  teamsByCode?: Record<string, string>
  teamsByName?: Record<string, string>
  nameToEsportsSlug?: Record<string, string>
  teamSlugAliases: Record<string, string>
  teamColors?: Record<string, string>
}

const manifest = esportsLogos as EsportsLogoManifest

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function resolveEsportsTeamSlug(nameOrSlug: string): string {
  const slug = slugify(nameOrSlug)
  const norm = normalizeName(nameOrSlug)

  const mapped = TEAM_ENTITIES.find(
    (t) =>
      t.slug === slug ||
      t.canonicalName.toLowerCase() === nameOrSlug.toLowerCase() ||
      t.oeNames.some((n) => n.toLowerCase() === nameOrSlug.toLowerCase()),
  )
  if (mapped?.esportsSlug) return mapped.esportsSlug

  return (
    manifest.teamSlugAliases[slug] ??
    manifest.nameToEsportsSlug?.[norm] ??
    manifest.nameToEsportsSlug?.[slug] ??
    (manifest.teamsByEsportsSlug[slug] ? slug : slug)
  )
}

function logoForEsportsSlug(esportsSlug: string): { primary: string | null; alt: string | null } {
  return {
    primary: manifest.teamsByEsportsSlug[esportsSlug] ?? null,
    alt: manifest.teamsAltByEsportsSlug?.[esportsSlug] ?? null,
  }
}

export function ddragonChampionKey(name: string): string {
  if (CHAMPION_DDRAGON[name]) return CHAMPION_DDRAGON[name]
  if (ddragonManifest.byName[name]) return ddragonManifest.byName[name]
  const norm = normalizeName(name)
  if (ddragonManifest.byNormalizedName[norm]) return ddragonManifest.byNormalizedName[norm]
  return name.replace(/[^a-zA-Z0-9]/g, '')
}

export function championIconUrl(ddragonKey: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonManifest.version}/img/champion/${ddragonKey}.png`
}

export function teamLogoUrlsFromName(name: string): string[] {
  const esportsSlug = resolveEsportsTeamSlug(name)
  const fromSlug = logoForEsportsSlug(esportsSlug)
  const urls: string[] = []
  if (fromSlug.primary) urls.push(fromSlug.primary)
  if (fromSlug.alt && fromSlug.alt !== fromSlug.primary) urls.push(fromSlug.alt)

  const code = teamSearchAbbreviation(name).toUpperCase()
  const fromCode = manifest.teamsByCode?.[code]
  if (fromCode && !urls.includes(fromCode)) urls.push(fromCode)

  const nameKey = normalizeName(name)
  const fromName = manifest.teamsByName?.[nameKey]
  if (fromName && !urls.includes(fromName)) urls.push(fromName)

  return urls
}

export function teamLogoUrlFromSlug(slug: string): string | null {
  return teamLogoUrlsFromName(slug)[0] ?? null
}

export function teamLogoUrlFromName(name: string): string | null {
  return teamLogoUrlsFromName(name)[0] ?? null
}

export function teamLogoAbbreviation(name: string): string {
  return teamSearchAbbreviation(name)
}

export function teamBrandColorFromName(teamName: string): string | null {
  const esportsSlug = resolveEsportsTeamSlug(teamName)
  return manifest.teamColors?.[esportsSlug] ?? null
}

export function leagueLogoUrl(league: string): string | null {
  if (!league || league === 'All Tier 1') return null
  return manifest.leagues[league] ?? null
}

/** Whether two team labels refer to the same LoL Esports org. */
export function teamsShareEsportsSlug(a: string, b: string): boolean {
  return resolveEsportsTeamSlug(a) === resolveEsportsTeamSlug(b)
}
