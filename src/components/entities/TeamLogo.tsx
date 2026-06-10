import { useState } from 'react'
import { teamLogoAbbreviation, teamLogoUrlsFromName } from '../../lib/entities'

interface TeamLogoProps {
  name: string
  size?: number
  className?: string
}

export default function TeamLogo({ name, size = 20, className = '' }: TeamLogoProps) {
  const candidates = teamLogoUrlsFromName(name)
  const abbr = teamLogoAbbreviation(name)
  const [urlIndex, setUrlIndex] = useState(0)
  const [failed, setFailed] = useState(candidates.length === 0)

  const src = candidates[urlIndex] ?? null

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
      onError={() => {
        if (urlIndex + 1 < candidates.length) {
          setUrlIndex((i) => i + 1)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}
