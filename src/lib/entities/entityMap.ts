/** Canonical entity aliases — team renames, abbreviations, DDragon keys. */

import esportsLogos from '../../data/esports-logos.json'

export interface TeamEntityDef {
  canonicalName: string
  oeNames: string[]
  abbreviations: string[]
  slug: string
  /** Optional Riot / LoL Esports CDN logo URL */
  logoUrl?: string
  /** lootmarket/esport-team-logos folder when it differs from slug */
  logoFolder?: string
  /** LoL Esports API team slug when it differs from our slug */
  esportsSlug?: string
}

export interface ChampionEntityDef {
  oeNames: string[]
  ddragonKey: string
  slug: string
}

export const TEAM_ENTITIES: TeamEntityDef[] = [
  {
    canonicalName: 'Gen.G',
    oeNames: ['Gen.G', 'Gen G', 'GEN'],
    abbreviations: ['GEN', 'GENG'],
    slug: 'gen-g',
    esportsSlug: 'geng',
  },
  {
    canonicalName: 'T1',
    oeNames: ['T1', 'SK telecom T1', 'SKT', 'SK Telecom T1'],
    abbreviations: ['T1', 'SKT'],
    slug: 't1',
  },
  {
    canonicalName: 'Dplus Kia',
    oeNames: ['Dplus Kia', 'Dplus KIA', 'DWG KIA', 'DK', 'Dplus Kia'],
    abbreviations: ['DK', 'DKIA'],
    slug: 'dplus-kia',
    esportsSlug: 'dwg-kia',
  },
  {
    canonicalName: 'Hanwha Life Esports',
    oeNames: ['Hanwha Life Esports', 'HLE'],
    abbreviations: ['HLE'],
    slug: 'hanwha-life-esports',
  },
  {
    canonicalName: 'Fnatic',
    oeNames: ['Fnatic', 'FNC'],
    abbreviations: ['FNC', 'FNC'],
    slug: 'fnatic',
  },
  {
    canonicalName: 'G2 Esports',
    oeNames: ['G2 Esports', 'G2'],
    abbreviations: ['G2'],
    slug: 'g2-esports',
  },
  {
    canonicalName: 'Cloud9',
    oeNames: ['Cloud9', 'C9'],
    abbreviations: ['C9'],
    slug: 'cloud9',
  },
  {
    canonicalName: 'Team Liquid',
    oeNames: ['Team Liquid', 'TL'],
    abbreviations: ['TL'],
    slug: 'team-liquid',
  },
  {
    canonicalName: 'Bilibili Gaming',
    oeNames: ['Bilibili Gaming', 'BLG'],
    abbreviations: ['BLG'],
    slug: 'bilibili-gaming',
  },
  {
    canonicalName: 'JD Gaming',
    oeNames: ['JD Gaming', 'JDG'],
    abbreviations: ['JDG'],
    slug: 'jd-gaming',
  },
  {
    canonicalName: 'Top Esports',
    oeNames: ['Top Esports', 'TES'],
    abbreviations: ['TES'],
    slug: 'top-esports',
  },
  {
    canonicalName: 'KT Rolster',
    oeNames: ['KT Rolster', 'KT', 'KTR'],
    abbreviations: ['KT'],
    slug: 'kt-rolster',
    esportsSlug: 'kt-rolster',
  },
  {
    canonicalName: 'Nongshim RedForce',
    oeNames: ['Nongshim RedForce', 'Nongshim Red Force', 'NS RedForce', 'NS'],
    abbreviations: ['NS'],
    slug: 'nongshim-redforce',
    esportsSlug: 'nongshim-redforce',
  },
  {
    canonicalName: 'DRX',
    oeNames: ['DRX'],
    abbreviations: ['DRX'],
    slug: 'drx',
    esportsSlug: 'drx',
  },
  {
    canonicalName: 'FearX',
    oeNames: ['FearX', 'BNK FEARX', 'BNK FearX', 'BFX'],
    abbreviations: ['BFX'],
    slug: 'fearx',
    esportsSlug: 'fearx',
  },
  {
    canonicalName: 'Team WE',
    oeNames: ['Team WE', 'WE', "Xi'an Team WE"],
    abbreviations: ['WE'],
    slug: 'team-we',
    esportsSlug: 'team-we',
  },
  {
    canonicalName: 'Weibo Gaming',
    oeNames: ['Weibo Gaming', 'WBG'],
    abbreviations: ['WBG'],
    slug: 'weibo-gaming',
    esportsSlug: 'weibo-gaming',
  },
  {
    canonicalName: 'Invictus Gaming',
    oeNames: ['Invictus Gaming', 'IG'],
    abbreviations: ['IG'],
    slug: 'invictus-gaming',
    esportsSlug: 'invictus-gaming',
  },
  {
    canonicalName: 'FunPlus Phoenix',
    oeNames: ['FunPlus Phoenix', 'FPX'],
    abbreviations: ['FPX'],
    slug: 'funplus-phoenix',
    esportsSlug: 'funplus-phoenix',
  },
  {
    canonicalName: 'LNG Esports',
    oeNames: ['LNG Esports', 'LNG'],
    abbreviations: ['LNG'],
    slug: 'lng-esports',
    esportsSlug: 'lng-esports',
  },
  {
    canonicalName: 'Oh My God',
    oeNames: ['Oh My God', 'OMG'],
    abbreviations: ['OMG'],
    slug: 'oh-my-god',
    esportsSlug: 'oh-my-god',
  },
  {
    canonicalName: 'Ultra Prime',
    oeNames: ['Ultra Prime', 'UP'],
    abbreviations: ['UP'],
    slug: 'ultra-prime',
    esportsSlug: 'ultra-prime',
  },
  {
    canonicalName: 'EDward Gaming',
    oeNames: ['EDward Gaming', 'EDG'],
    abbreviations: ['EDG'],
    slug: 'edward-gaming',
    esportsSlug: 'edward-gaming',
  },
  {
    canonicalName: "Anyone's Legend",
    oeNames: ["Anyone's Legend", 'Anyones Legend', 'AL'],
    abbreviations: ['AL'],
    slug: 'anyones-legend',
    esportsSlug: 'anyones-legend',
  },
  {
    canonicalName: 'Lyon Gaming',
    oeNames: ['Lyon Gaming', 'LYON', 'Lyon'],
    abbreviations: ['LYON'],
    slug: 'lyon-gaming',
    esportsSlug: 'lyon-gaming',
  },
  {
    canonicalName: 'Karmine Corp',
    oeNames: ['Karmine Corp', 'KC'],
    abbreviations: ['KC'],
    slug: 'karmine-corp',
    esportsSlug: 'karmine-corp',
  },
  {
    canonicalName: 'Movistar KOI',
    oeNames: ['Movistar KOI', 'MKOI', 'Mad Lions'],
    abbreviations: ['MKOI'],
    slug: 'movistar-koi',
    esportsSlug: 'mad-lions',
  },
  {
    canonicalName: 'Team BDS',
    oeNames: ['Team BDS', 'BDS'],
    abbreviations: ['BDS'],
    slug: 'team-bds',
    esportsSlug: 'team-bds',
  },
  {
    canonicalName: 'SK Gaming',
    oeNames: ['SK Gaming', 'SK'],
    abbreviations: ['SK'],
    slug: 'sk-gaming',
    esportsSlug: 'sk-gaming',
  },
  {
    canonicalName: 'GiantX',
    oeNames: ['GiantX', 'GIANTX', 'GX'],
    abbreviations: ['GX'],
    slug: 'giantx-lec',
    esportsSlug: 'giantx-lec',
  },
  {
    canonicalName: 'Astralis',
    oeNames: ['Astralis', 'AST'],
    abbreviations: ['AST'],
    slug: 'astralis',
    esportsSlug: 'astralis',
  },
  {
    canonicalName: 'FlyQuest',
    oeNames: ['FlyQuest', 'FLY'],
    abbreviations: ['FLY'],
    slug: 'flyquest',
    esportsSlug: 'flyquest',
  },
  {
    canonicalName: '100 Thieves',
    oeNames: ['100 Thieves', '100T'],
    abbreviations: ['100T'],
    slug: '100-thieves',
    esportsSlug: '100-thieves',
  },
  {
    canonicalName: 'NRG',
    oeNames: ['NRG', 'NRG Esports'],
    abbreviations: ['NRG'],
    slug: 'nrg',
    esportsSlug: 'nrg',
  },
  {
    canonicalName: 'FURIA',
    oeNames: ['FURIA', 'FURIA Esports'],
    abbreviations: ['FUR'],
    slug: 'furia',
    esportsSlug: 'furia',
  },
]

type EsportsLogoManifest = {
  teamsByCode?: Record<string, string>
  teamsByEsportsSlug?: Record<string, string>
  teamsByName?: Record<string, string>
  nameToEsportsSlug?: Record<string, string>
  teamSlugAliases?: Record<string, string>
}

const esportsManifest = esportsLogos as EsportsLogoManifest

function normalizeTeamName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function slugifyTeamName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveEsportsSlugFromManifest(oeTeamName: string): string {
  const norm = normalizeTeamName(oeTeamName)
  const slug = slugifyTeamName(oeTeamName)
  return (
    esportsManifest.teamSlugAliases?.[norm] ??
    esportsManifest.teamSlugAliases?.[slug] ??
    esportsManifest.nameToEsportsSlug?.[norm] ??
    esportsManifest.nameToEsportsSlug?.[slug] ??
    slug
  )
}

function officialCodeFromManifest(oeTeamName: string): string | null {
  const norm = normalizeTeamName(oeTeamName)
  const slug = resolveEsportsSlugFromManifest(oeTeamName)
  const logoUrl =
    esportsManifest.teamsByEsportsSlug?.[slug] ??
    esportsManifest.teamsByName?.[norm] ??
    esportsManifest.teamsByName?.[slug]
  if (!logoUrl) return null

  for (const [code, url] of Object.entries(esportsManifest.teamsByCode ?? {})) {
    if (url === logoUrl) return code
  }
  return null
}

/** OE display name → DDragon champion id */
/** Short team tag for search meta (e.g. JD Gaming → JDG). */
export function teamSearchAbbreviation(oeTeamName: string): string {
  if (!oeTeamName) return ''
  const lower = oeTeamName.toLowerCase()
  for (const team of TEAM_ENTITIES) {
    if (
      team.canonicalName.toLowerCase() === lower ||
      team.oeNames.some((n) => n.toLowerCase() === lower) ||
      team.abbreviations.some((a) => a.toLowerCase() === lower)
    ) {
      return team.abbreviations[0] ?? team.canonicalName
    }
  }

  const fromManifest = officialCodeFromManifest(oeTeamName)
  if (fromManifest) return fromManifest

  if (!oeTeamName.includes(' ') && oeTeamName.length <= 6) return oeTeamName
  return oeTeamName
}

export const CHAMPION_DDRAGON: Record<string, string> = {
  Wukong: 'MonkeyKing',
  'Renata Glasc': 'Renata',
  'Nunu & Willump': 'Nunu',
  'Belveth': 'Belveth',
  'KogMaw': "Kog'Maw",
  "Kog'Maw": 'KogMaw',
  'Dr. Mundo': 'DrMundo',
  'Jarvan IV': 'JarvanIV',
  'Lee Sin': 'LeeSin',
  'Miss Fortune': 'MissFortune',
  'Twisted Fate': 'TwistedFate',
  'Xin Zhao': 'XinZhao',
  'Master Yi': 'MasterYi',
  'Aurelion Sol': 'AurelionSol',
  'ChoGath': "Cho'Gath",
  "Cho'Gath": 'Chogath',
  'KaiSa': "Kai'Sa",
  "Kai'Sa": 'Kaisa',
  'KhaZix': "Kha'Zix",
  "Kha'Zix": 'Khazix',
  'LeBlanc': 'Leblanc',
  'RekSai': 'RekSai',
  'VelKoz': 'Velkoz',
  'BelVeth': 'Belveth',
}
