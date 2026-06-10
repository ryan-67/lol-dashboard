import { leagueColor } from '../teamAnalytics'
import { teamBrandColorFromName } from './assets'

/** Primary brand color from synced LoL Esports logo manifest, else league color. */
export function teamBrandColor(teamName: string, league?: string): string {
  return teamBrandColorFromName(teamName) ?? (league ? leagueColor(league) : '#c5a059')
}
