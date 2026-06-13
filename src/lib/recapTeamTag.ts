import { teamSearchAbbreviation } from './entities/entityMap'
import { resolveTeamCanonicalName } from './entities/slugs'

/** Official short tag for recap score rows and AI token labels (e.g. KT, WE — not KR/TW). */
export function recapTeamTag(name: string): string {
  const canonical = resolveTeamCanonicalName(name)
  return teamSearchAbbreviation(canonical).toUpperCase()
}
