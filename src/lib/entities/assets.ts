import { CHAMPION_DDRAGON, TEAM_ENTITIES, teamSearchAbbreviation } from './entityMap'
import { teamSlugFromName } from './slugs'

/** Riot Data Dragon — official champion square icons */
const DDRAGON_VERSION = '14.24.1'

/** Crowdsourced tier-1 team logos (lootmarket/esport-team-logos). */
const TEAM_LOGO_CDN =
  'https://raw.githubusercontent.com/lootmarket/esport-team-logos/master/league-of-legends'

/** Folder name overrides when repo path differs from our slug. */
const TEAM_LOGO_FOLDER: Record<string, string> = {
  'gen-g': 'gen-g',
  'dplus-kia': 'dplus-kia',
  'hanwha-life-esports': 'hanwha-life-esports',
  'jd-gaming': 'jd-gaming',
  'bilibili-gaming': 'bilibili-gaming',
  'top-esports': 'top-esports',
  'team-liquid': 'team-liquid',
  'g2-esports': 'g2-esports',
  'cloud9': 'cloud9',
  fnatic: 'fnatic',
  t1: 't1',
  'kt-rolster': 'kt-rolster',
  'nongshim-redforce': 'nongshim-redforce',
  'drx': 'drx',
  'fearx': 'fearx',
  'ok-brion': 'brion',
  'ok-savingsbank-brion': 'brion',
  'weibo-gaming': 'weibo-gaming',
  'lng-esports': 'lng-esports',
  'invictus-gaming': 'invictus-gaming',
  'edward-gaming': 'edward-gaming',
  'rare-atom': 'rare-atom',
  'ultra-prime': 'ultra-prime',
  'thunder-talk-gaming': 'thunder-talk-gaming',
  'lgd-gaming': 'lgd-gaming',
  'funplus-phoenix': 'funplus-phoenix',
  'anyone-s-legend': 'anyone-s-legend',
  'karmine-corp': 'karmine-corp',
  'team-vitality': 'team-vitality',
  'sk-gaming': 'sk-gaming',
  'giantx': 'giantx',
  'giant-x': 'giantx',
  'misfits-gaming': 'misfits-gaming',
  'shopify-rebellion': 'shopify-rebellion',
  '100-thieves': '100-thieves',
  'flyquest': 'flyquest',
  'disguised': 'disguised',
  'dignitas': 'dignitas',
}

/** League wordmarks from Leaguepedia (stable CDN). */
const LEAGUE_LOGO_URLS: Record<string, string> = {
  LCK: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/4/4f/LCK_2019_full.png/revision/latest/scale-to-width-down/48',
  LPL: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/88/LPL_2020_full.png/revision/latest/scale-to-width-down/48',
  LEC: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/a/a3/LEC_2019_full.png/revision/latest/scale-to-width-down/48',
  LCS: 'https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/1/13/LCS_2020_full.png/revision/latest/scale-to-width-down/48',
}

export function ddragonChampionKey(name: string): string {
  if (CHAMPION_DDRAGON[name]) return CHAMPION_DDRAGON[name]
  return name.replace(/[^a-zA-Z0-9]/g, '')
}

export function championIconUrl(ddragonKey: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${ddragonKey}.png`
}

function logoFolderForSlug(slug: string): string {
  const mapped = TEAM_ENTITIES.find((t) => t.slug === slug)
  if (mapped?.logoFolder) return mapped.logoFolder
  return TEAM_LOGO_FOLDER[slug] ?? slug
}

export function teamLogoUrlFromSlug(slug: string): string | null {
  if (!slug) return null
  const folder = logoFolderForSlug(slug)
  return `${TEAM_LOGO_CDN}/${folder}/${folder}-logo.png`
}

export function teamLogoUrlFromName(name: string): string | null {
  return teamLogoUrlFromSlug(teamSlugFromName(name))
}

export function teamLogoAbbreviation(name: string): string {
  return teamSearchAbbreviation(name)
}

export function leagueLogoUrl(league: string): string | null {
  if (!league || league === 'All Tier 1') return null
  return LEAGUE_LOGO_URLS[league] ?? null
}
