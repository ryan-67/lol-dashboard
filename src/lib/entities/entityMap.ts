/** Canonical entity aliases — team renames, abbreviations, DDragon keys. */

export interface TeamEntityDef {
  canonicalName: string
  oeNames: string[]
  abbreviations: string[]
  slug: string
  /** Optional Riot / LoL Esports CDN logo URL */
  logoUrl?: string
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
]

/** OE display name → DDragon champion id */
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
