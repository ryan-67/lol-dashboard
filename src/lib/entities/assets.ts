import { CHAMPION_DDRAGON, TEAM_ENTITIES, teamSearchAbbreviation } from './entityMap'
import { teamSlugFromName } from './slugs'
import esportsLogos from '../../data/esports-logos.json'

/** Riot Data Dragon — official champion square icons */
const DDRAGON_VERSION = '14.24.1'

type EsportsLogoManifest = {
  leagues: Record<string, string>
  teamsByEsportsSlug: Record<string, string>
  teamSlugAliases: Record<string, string>
}

const manifest = esportsLogos as EsportsLogoManifest

function resolveEsportsTeamSlug(slug: string): string {
  return manifest.teamSlugAliases[slug] ?? slug
}

function teamLogoFromEsportsSlug(esportsSlug: string): string | null {
  return manifest.teamsByEsportsSlug[esportsSlug] ?? null
}

export function ddragonChampionKey(name: string): string {
  if (CHAMPION_DDRAGON[name]) return CHAMPION_DDRAGON[name]
  return name.replace(/[^a-zA-Z0-9]/g, '')
}

export function championIconUrl(ddragonKey: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${ddragonKey}.png`
}

export function teamLogoUrlFromSlug(slug: string): string | null {
  if (!slug) return null

  const mapped = TEAM_ENTITIES.find((t) => t.slug === slug)
  if (mapped?.logoUrl) return mapped.logoUrl

  const esportsSlug = mapped?.esportsSlug ?? resolveEsportsTeamSlug(slug)
  return teamLogoFromEsportsSlug(esportsSlug) ?? teamLogoFromEsportsSlug(slug)
}

export function teamLogoUrlFromName(name: string): string | null {
  return teamLogoUrlFromSlug(teamSlugFromName(name))
}

export function teamLogoAbbreviation(name: string): string {
  return teamSearchAbbreviation(name)
}

export function leagueLogoUrl(league: string): string | null {
  if (!league || league === 'All Tier 1') return null
  return manifest.leagues[league] ?? null
}
