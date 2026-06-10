import { useState } from 'react'
import { teamLogoAbbreviation, teamLogoUrlFromSlug, teamSlugFromName } from '../../lib/entities'

interface TeamLogoProps {
  name: string
  size?: number
  className?: string
}

export default function TeamLogo({ name, size = 20, className = '' }: TeamLogoProps) {
  const slug = teamSlugFromName(name)
  const src = teamLogoUrlFromSlug(slug)
  const abbr = teamLogoAbbreviation(name)
  const [failed, setFailed] = useState(!src)

  if (failed || !src) {
    return (
      <span
        className={`team-logo team-logo-fallback ${className}`.trim()}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
        aria-hidden
      >
        {abbr.slice(0, 4)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`team-logo ${className}`.trim()}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
