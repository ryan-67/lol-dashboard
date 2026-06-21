import type { TickItem } from 'recharts/types/util/types'
import ChampionIcon from '../entities/ChampionIcon'

interface ChampionAxisTickProps {
  x?: number
  y?: number
  payload?: TickItem
}

/** Recharts Y-axis tick with champion icon left of name. */
export default function ChampionAxisTick({ x = 0, y = 0, payload }: ChampionAxisTickProps) {
  const name = payload?.value != null ? String(payload.value) : ''
  if (!name) return null

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-76} y={-10} width={72} height={20}>
        <div className="entity-champ-inline champion-axis-tick">
          <ChampionIcon name={name} size={16} />
          <span>{name}</span>
        </div>
      </foreignObject>
    </g>
  )
}
