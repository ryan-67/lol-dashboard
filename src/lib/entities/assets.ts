import { CHAMPION_DDRAGON } from './entityMap'

/** Riot Data Dragon — official champion square icons */

const DDRAGON_VERSION = '14.24.1'

export function ddragonChampionKey(name: string): string {
  if (CHAMPION_DDRAGON[name]) return CHAMPION_DDRAGON[name]
  return name.replace(/[^a-zA-Z0-9]/g, '')
}

export function championIconUrl(ddragonKey: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${ddragonKey}.png`
}

export function teamLogoUrlFromSlug(_slug: string): string | null {
  return null
}
