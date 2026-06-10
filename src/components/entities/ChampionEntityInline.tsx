import ChampionIcon from './ChampionIcon'
import EntityLink from './EntityLink'

export default function ChampionEntityInline({
  name,
  iconSize = 18,
}: {
  name: string
  iconSize?: number
}) {
  if (!name || name === 'N/A') return <span>{name}</span>

  return (
    <span className="entity-champ-inline">
      <ChampionIcon name={name} size={iconSize} />
      <EntityLink type="champion" name={name} showIcon={false} />
    </span>
  )
}
