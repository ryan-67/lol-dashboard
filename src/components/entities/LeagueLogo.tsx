import { leagueLogoUrl } from '../../lib/entities'

interface LeagueLogoProps {
  league: string
  size?: number
  className?: string
}

export default function LeagueLogo({ league, size = 20, className = '' }: LeagueLogoProps) {
  const src = leagueLogoUrl(league)
  if (!src) return null

  return (
    <img
      src={src}
      alt=""
      width={size * 2.8}
      height={size}
      className={`league-logo ${className}`.trim()}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
