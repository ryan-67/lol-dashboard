import { Link } from 'react-router-dom'
import {
  buildPlayerSearchSlug,
  championSlug,
  playerSlug,
  teamSlugFromName,
} from '../../lib/entities'
import type { Player } from '../../hooks/useDashboardData'
import ChampionIcon from './ChampionIcon'
import TeamLogo from './TeamLogo'

type EntityType = 'player' | 'team' | 'champion'

interface EntityLinkProps {
  type: EntityType
  name: string
  /** Required for player disambiguation when multiple same-name players exist */
  player?: Pick<Player, 'name' | 'team' | 'league'>
  allPlayers?: Player[]
  className?: string
  showIcon?: boolean
}

function hrefFor(type: EntityType, name: string, player?: EntityLinkProps['player'], allPlayers?: Player[]) {
  if (type === 'player') {
    if (player && allPlayers?.length) {
      return `/players/${buildPlayerSearchSlug(player as Player, allPlayers)}`
    }
    return `/players/${playerSlug(name)}`
  }
  if (type === 'team') return `/teams/${teamSlugFromName(name)}`
  return `/champions/${championSlug(name)}`
}

export default function EntityLink({
  type,
  name,
  player,
  allPlayers,
  className = '',
  showIcon = type !== 'player',
}: EntityLinkProps) {
  if (!name || name === 'N/A') return <span className={className}>{name}</span>

  const to = hrefFor(type, name, player ?? (allPlayers ? allPlayers.find((p) => p.name === name) : undefined), allPlayers)

  return (
    <Link to={to} className={`entity-link ${className}`.trim()}>
      {showIcon && type === 'champion' ? <ChampionIcon name={name} size={18} /> : null}
      {showIcon && type === 'team' ? <TeamLogo name={name} size={18} /> : null}
      <span>{name}</span>
    </Link>
  )
}
