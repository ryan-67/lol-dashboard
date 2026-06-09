import { ddragonChampionKey, championIconUrl } from '../../lib/entities/assets'

interface ChampionIconProps {
  name: string
  size?: number
  className?: string
}

export default function ChampionIcon({ name, size = 20, className = '' }: ChampionIconProps) {
  if (!name) return null
  const key = ddragonChampionKey(name)
  const src = championIconUrl(key)

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`champion-icon ${className}`.trim()}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}
