import { useState } from 'react'
import TeamLogo from '../entities/TeamLogo'

interface LiveTeamLogoProps {
  name: string
  logoUrl?: string | null
  size?: number
  className?: string
}

/**
 * Team logo for live views. Prefers the Cito-provided `logoUrl`, falling back to
 * the local esports-logo resolver (by team name) if it is missing or fails.
 */
export default function LiveTeamLogo({ name, logoUrl, size = 28, className = '' }: LiveTeamLogoProps) {
  const [failed, setFailed] = useState(false)

  if (!logoUrl || failed) {
    return <TeamLogo name={name} size={size} className={className} />
  }

  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      className={`team-logo ${className}`.trim()}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
