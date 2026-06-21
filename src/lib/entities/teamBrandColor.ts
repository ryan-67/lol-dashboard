import { leagueColor } from '../teamAnalytics'
import { teamBrandColorFromName } from './assets'

/** Primary brand color from synced LoL Esports logo manifest, else league color. */
export function teamBrandColor(teamName: string, league?: string): string {
  return teamBrandColorFromName(teamName) ?? (league ? leagueColor(league) : '#c5a059')
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 6) return null
  const n = parseInt(normalized, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function mixHex(a: string, b: string, weightB: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return a
  const w = Math.min(1, Math.max(0, weightB))
  const mix = (x: number, y: number) => Math.round(x * (1 - w) + y * w)
  const r = mix(ca.r, cb.r)
  const g = mix(ca.g, cb.g)
  const bl = mix(ca.b, cb.b)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

/**
 * Muted team identity color for radar charts on charcoal backgrounds.
 * Avoids near-black primaries by falling back to league color, then lightens slightly.
 */
export function mutedTeamBrandColor(teamName: string, league?: string): string {
  let color = teamBrandColor(teamName, league)
  const rgb = parseHex(color)
  if (rgb && relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.06) {
    color = league ? leagueColor(league) : '#c5a059'
  }
  return mixHex(color, '#f0ece2', 0.12)
}

/** Radar stroke/fill color for a player based on their team identity. */
export function radarColorForPlayer(teamName: string, league?: string): string {
  return mutedTeamBrandColor(teamName, league)
}

/** Radar stroke/fill color for a team entity. */
export function radarColorForTeam(teamName: string, league?: string): string {
  return mutedTeamBrandColor(teamName, league)
}
