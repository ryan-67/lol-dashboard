import { ddragonChampionKey, championIconUrl, communityDragonChampionIconUrl } from '../../lib/entities/assets'

interface ChampionIconProps {
  name: string
  size?: number
  className?: string
}

export default function ChampionIcon({ name, size = 20, className = '' }: ChampionIconProps) {
  if (!name) return null
  const key = ddragonChampionKey(name)
  const src = championIconUrl(key)
  const fallback = communityDragonChampionIconUrl(name)

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`champion-icon ${className}`.trim()}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget
        if (img.dataset.fallback === '1') {
          img.style.visibility = 'hidden'
          return
        }
        img.dataset.fallback = '1'
        img.src = fallback
      }}
    />
  )
}
