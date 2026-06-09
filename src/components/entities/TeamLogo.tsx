import { teamLogoUrlFromSlug, teamSlugFromName } from '../../lib/entities'

interface TeamLogoProps {
  name: string
  size?: number
  className?: string
}

export default function TeamLogo({ name, size = 20, className = '' }: TeamLogoProps) {
  const slug = teamSlugFromName(name)
  const src = teamLogoUrlFromSlug(slug)
  if (!src) return null

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`team-logo ${className}`.trim()}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
