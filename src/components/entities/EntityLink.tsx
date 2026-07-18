import { Link, useLocation } from 'react-router-dom'
import {
  buildPlayerSearchSlug,
  championSlug,
  playerSlug,
  teamSlugFromName,
} from '../../lib/entities'
import { shellAwarePath } from '../../lib/shellPath'
import type { Player } from '../../hooks/useDashboardData'
import ChampionIcon from './ChampionIcon'
import TeamLogo from './TeamLogo'

type EntityType = 'player' | 'team' | 'champion'

interface EntityLinkProps {
  type: EntityType
  name: string
  /** Override visible link text (defaults to name). */
  children?: React.ReactNode
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
  children,
  player,
  allPlayers,
  className = '',
  showIcon = type !== 'player',
}: EntityLinkProps) {
  const location = useLocation()
  if (!name || name === 'N/A') return <span className={className}>{children ?? name}</span>

  const raw = hrefFor(
    type,
    name,
    player ?? (allPlayers ? allPlayers.find((p) => p.name === name) : undefined),
    allPlayers,
  )
  const to = shellAwarePath(raw, location.pathname)
  const label = children ?? name

  return (
    <Link to={to} className={`entity-link ${className}`.trim()}>
      {showIcon && type === 'champion' ? <ChampionIcon name={name} size={18} /> : null}
      {showIcon && type === 'team' ? <TeamLogo name={name} size={18} /> : null}
      <span>{label}</span>
    </Link>
  )
}
