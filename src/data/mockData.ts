export interface Player {
  name: string
  team: string
  league: string
  position: string
  games: number
  kda: number
  kp: number
  dmgShare: number
  gd15: number
  csd15: number
  xpd15: number
}

export interface Team {
  name: string
  league: string
  games: number
  wins: number
  losses: number
  winrate: number
  avgKda: number
  avgGd15: number
  towers: number
  dragons: number
  barons: number
  heralds: number
}

export interface Champion {
  name: string
  positions: string[]
  picks: number
  bans: number
  presence: number
  winrate: number
  avgKda: number
}

export const LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS', 'All Tier 1']
export const SPLITS = ['2025 Spring', '2024 Summer', '2024 Spring']

export const players: Player[] = [
  { name: 'Faker', team: 'T1', league: 'LCK', position: 'mid', games: 18, kda: 4.2, kp: 68.5, dmgShare: 28.3, gd15: 234, csd15: 8.2, xpd15: 412 },
  { name: 'Chovy', team: 'GEN', league: 'LCK', position: 'mid', games: 18, kda: 5.8, kp: 71.2, dmgShare: 29.1, gd15: 456, csd15: 18.5, xpd15: 678 },
  { name: 'Peyz', team: 'GEN', league: 'LCK', position: 'adc', games: 18, kda: 6.1, kp: 74.3, dmgShare: 31.2, gd15: 312, csd15: 22.1, xpd15: 156 },
  { name: 'Kiin', team: 'GEN', league: 'LCK', position: 'top', games: 18, kda: 3.9, kp: 62.1, dmgShare: 22.4, gd15: 198, csd15: 12.3, xpd15: 89 },
  { name: 'Canyon', team: 'GEN', league: 'LCK', position: 'jungle', games: 18, kda: 4.5, kp: 78.9, dmgShare: 15.2, gd15: 124, csd15: 2.1, xpd15: 234 },
  { name: 'Lehends', team: 'GEN', league: 'LCK', position: 'support', games: 18, kda: 5.2, kp: 82.1, dmgShare: 8.4, gd15: 45, csd15: -1.2, xpd15: -56 },
  { name: 'Gumayusi', team: 'T1', league: 'LCK', position: 'adc', games: 18, kda: 4.8, kp: 69.2, dmgShare: 30.1, gd15: 267, csd15: 15.6, xpd15: 98 },
  { name: 'Zeus', team: 'T1', league: 'LCK', position: 'top', games: 18, kda: 3.5, kp: 58.4, dmgShare: 24.5, gd15: 156, csd15: 9.8, xpd15: 45 },
  { name: 'Oner', team: 'T1', league: 'LCK', position: 'jungle', games: 18, kda: 3.8, kp: 75.6, dmgShare: 16.8, gd15: 89, csd15: 1.5, xpd15: 178 },
  { name: 'Keria', team: 'T1', league: 'LCK', position: 'support', games: 18, kda: 6.3, kp: 85.4, dmgShare: 9.1, gd15: 67, csd15: -0.5, xpd15: -34 },
  { name: 'Knight', team: 'BLG', league: 'LPL', position: 'mid', games: 16, kda: 5.1, kp: 70.3, dmgShare: 27.8, gd15: 389, csd15: 16.2, xpd15: 567 },
  { name: 'Bin', team: 'BLG', league: 'LPL', position: 'top', games: 16, kda: 4.2, kp: 61.5, dmgShare: 25.1, gd15: 245, csd15: 14.8, xpd15: 123 },
  { name: 'Elk', team: 'BLG', league: 'LPL', position: 'adc', games: 16, kda: 5.5, kp: 72.1, dmgShare: 29.4, gd15: 298, csd15: 19.3, xpd15: 87 },
  { name: 'Caps', team: 'G2', league: 'LEC', position: 'mid', games: 14, kda: 4.6, kp: 69.8, dmgShare: 26.5, gd15: 198, csd15: 11.2, xpd15: 345 },
  { name: 'BrokenBlade', team: 'G2', league: 'LEC', position: 'top', games: 14, kda: 3.2, kp: 55.3, dmgShare: 21.8, gd15: 87, csd15: 6.5, xpd15: 34 },
  { name: 'Hans sama', team: 'G2', league: 'LEC', position: 'adc', games: 14, kda: 4.9, kp: 68.4, dmgShare: 28.9, gd15: 234, csd15: 14.2, xpd15: 67 },
  { name: 'CoreJJ', team: 'TL', league: 'LCS', position: 'support', games: 12, kda: 4.1, kp: 76.2, dmgShare: 7.8, gd15: 23, csd15: -2.1, xpd15: -78 },
  { name: 'APA', team: 'TL', league: 'LCS', position: 'mid', games: 12, kda: 3.5, kp: 66.1, dmgShare: 25.3, gd15: 67, csd15: 4.2, xpd15: 89 },
  { name: 'Yeon', team: 'TL', league: 'LCS', position: 'adc', games: 12, kda: 4.3, kp: 67.5, dmgShare: 27.1, gd15: 145, csd15: 8.9, xpd15: 45 },
  { name: 'Impact', team: 'TL', league: 'LCS', position: 'top', games: 12, kda: 3.1, kp: 56.8, dmgShare: 20.5, gd15: 56, csd15: 3.2, xpd15: 12 },
]

export const teams: Team[] = [
  { name: 'T1', league: 'LCK', games: 18, wins: 14, losses: 4, winrate: 77.8, avgKda: 4.2, avgGd15: 156, towers: 187, dragons: 45, barons: 23, heralds: 34 },
  { name: 'GEN', league: 'LCK', games: 18, wins: 16, losses: 2, winrate: 88.9, avgKda: 5.1, avgGd15: 234, towers: 198, dragons: 52, barons: 28, heralds: 38 },
  { name: 'HLE', league: 'LCK', games: 18, wins: 12, losses: 6, winrate: 66.7, avgKda: 3.8, avgGd15: 89, towers: 165, dragons: 41, barons: 19, heralds: 31 },
  { name: 'DK', league: 'LCK', games: 18, wins: 10, losses: 8, winrate: 55.6, avgKda: 3.5, avgGd15: 34, towers: 154, dragons: 38, barons: 17, heralds: 28 },
  { name: 'BLG', league: 'LPL', games: 16, wins: 13, losses: 3, winrate: 81.3, avgKda: 4.5, avgGd15: 198, towers: 176, dragons: 43, barons: 21, heralds: 32 },
  { name: 'TES', league: 'LPL', games: 16, wins: 11, losses: 5, winrate: 68.8, avgKda: 4.0, avgGd15: 112, towers: 162, dragons: 39, barons: 18, heralds: 29 },
  { name: 'JDG', league: 'LPL', games: 16, wins: 10, losses: 6, winrate: 62.5, avgKda: 3.7, avgGd15: 67, towers: 148, dragons: 36, barons: 16, heralds: 26 },
  { name: 'G2', league: 'LEC', games: 14, wins: 11, losses: 3, winrate: 78.6, avgKda: 4.1, avgGd15: 134, towers: 156, dragons: 34, barons: 15, heralds: 24 },
  { name: 'FNC', league: 'LEC', games: 14, wins: 9, losses: 5, winrate: 64.3, avgKda: 3.6, avgGd15: 56, towers: 138, dragons: 31, barons: 13, heralds: 21 },
  { name: 'TL', league: 'LCS', games: 12, wins: 8, losses: 4, winrate: 66.7, avgKda: 3.4, avgGd15: 45, towers: 112, dragons: 26, barons: 11, heralds: 18 },
  { name: 'FLY', league: 'LCS', games: 12, wins: 7, losses: 5, winrate: 58.3, avgKda: 3.2, avgGd15: 23, towers: 108, dragons: 24, barons: 10, heralds: 17 },
]

export const champions: Champion[] = [
  { name: 'Kalista', positions: ['adc'], picks: 45, bans: 38, presence: 72, winrate: 54.2, avgKda: 4.8 },
  { name: 'Azir', positions: ['mid'], picks: 38, bans: 22, presence: 58, winrate: 48.7, avgKda: 4.2 },
  { name: 'Ksante', positions: ['top'], picks: 52, bans: 18, presence: 68, winrate: 51.3, avgKda: 3.5 },
  { name: 'Vi', positions: ['jungle'], picks: 41, bans: 28, presence: 65, winrate: 52.8, avgKda: 3.8 },
  { name: 'Rumble', positions: ['top', 'support'], picks: 35, bans: 31, presence: 62, winrate: 55.1, avgKda: 3.2 },
  { name: 'Senna', positions: ['adc', 'support'], picks: 33, bans: 26, presence: 55, winrate: 53.4, avgKda: 5.1 },
  { name: 'Taliyah', positions: ['mid', 'jungle'], picks: 29, bans: 19, presence: 45, winrate: 49.2, avgKda: 4.5 },
  { name: 'Aatrox', positions: ['top'], picks: 28, bans: 8, presence: 35, winrate: 50.0, avgKda: 3.1 },
  { name: 'Ahri', positions: ['mid'], picks: 25, bans: 15, presence: 38, winrate: 52.0, avgKda: 4.9 },
  { name: 'Rakan', positions: ['support'], picks: 24, bans: 12, presence: 34, winrate: 54.2, avgKda: 5.3 },
  { name: 'Varus', positions: ['adc'], picks: 22, bans: 5, presence: 26, winrate: 50.0, avgKda: 4.4 },
  { name: 'Sejuani', positions: ['jungle'], picks: 20, bans: 9, presence: 28, winrate: 51.3, avgKda: 4.1 },
  { name: 'Gwen', positions: ['top'], picks: 18, bans: 14, presence: 30, winrate: 55.6, avgKda: 3.8 },
  { name: 'Zeri', positions: ['adc'], picks: 16, bans: 4, presence: 19, winrate: 47.8, avgKda: 5.5 },
  { name: 'Orianna', positions: ['mid'], picks: 15, bans: 3, presence: 17, winrate: 53.3, avgKda: 5.2 },
]
