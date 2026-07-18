import type { Player } from '../../hooks/useDashboardData'
import { getMetricValue, ROLE_METRICS, type RoleKey } from '../../lib/playerRadar'
import { RESULT_COLORS } from '../../theme/chartTheme'

interface PlayerRadarStatsGridProps {
  player: Player
  role: RoleKey
  cohort: Player[]
}

const DIFF_METRIC_KEYS = new Set(['gd15', 'csd15', 'xpd15'])

/**
 * Compact stat grid under the radar chart — every ROLE_METRICS entry as a
 * label + value tile, filling the space the radar leaves empty.
 */
export default function PlayerRadarStatsGrid({ player, role, cohort }: PlayerRadarStatsGridProps) {
  const defs = ROLE_METRICS[role]

  return (
    <div className="radar-stats-grid">
      {defs.map((def) => {
        const value = getMetricValue(player, def.key, { cohort })
        const isDiff = DIFF_METRIC_KEYS.has(def.key)
        const color =
          isDiff && value != null
            ? value > 0
              ? RESULT_COLORS.win
              : value < 0
                ? RESULT_COLORS.loss
                : undefined
            : undefined
        return (
          <div key={def.key} className="radar-stats-grid-item">
            <span className="radar-stats-grid-label">{def.label}</span>
            <span className="radar-stats-grid-value" style={color ? { color } : undefined}>
              {value != null ? def.format(value) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
