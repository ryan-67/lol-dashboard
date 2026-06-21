import { useMemo, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Player, Team } from '../../hooks/useDashboardData'
import {
  buildPlayerShareSlices,
  rosterPlayersForTeam,
} from '../../lib/teamComparisonAnalytics'
import { teamKey } from '../../lib/teamAnalytics'
import { roleLabel } from '../../lib/championAnalytics'
import { makeChartTooltipContent } from '../ui/ChartTooltip'
import ShareableChart from '../ui/ShareableChart'
import { TeamLogo } from '../entities'
import { scrollEntranceStagger } from '../../theme/animations'
import { CHART } from '../../theme/chartTheme'

interface TeamComparisonSharePiesProps {
  teams: Team[]
  players: Player[]
}

const shareTooltip = makeChartTooltipContent(
  (props) => {
    const row = props.payload?.[0]?.payload as { name?: string }
    return row?.name
  },
  (props) => {
    const row = props.payload?.[0]?.payload as { value?: number; role?: string }
    if (!row) return []
    return [
      { label: 'Share', value: `${(row.value ?? 0).toFixed(1)}%` },
      { label: 'Role', value: roleLabel(row.role as import('../../lib/playerRadar').RoleKey) },
    ]
  },
)

function SharePie({
  title,
  data,
}: {
  title: string
  data: ReturnType<typeof buildPlayerShareSlices>
}) {
  if (!data.length) {
    return (
      <div className="team-share-pie">
        <h5 className="card-subtitle">{title}</h5>
        <div className="empty-state text-sm">No data</div>
      </div>
    )
  }

  return (
    <div className="team-share-pie">
      <h5 className="card-subtitle">{title}</h5>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={72}
            stroke={CHART.grid}
            strokeWidth={1}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={shareTooltip} />
          <Legend
            wrapperStyle={{
              fontFamily: CHART.fontFamily,
              fontSize: 10,
              color: CHART.tick,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function TeamComparisonSharePies({ teams, players }: TeamComparisonSharePiesProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  const teamRosters = useMemo(
    () =>
      teams.map((team) => ({
        team,
        roster: rosterPlayersForTeam(players, team),
      })),
    [teams, players],
  )

  useGSAP(
    () => {
      scrollEntranceStagger(gridRef.current, '.team-share-card')
    },
    { scope: gridRef, dependencies: [teams.map((t) => teamKey(t)).join(',')] },
  )

  return (
    <div className="page-section">
      <h3 className="card-title">Player Resource Share</h3>
      <p className="card-subtitle">DMG% and GOLD% distribution by starter roster</p>
      <div ref={gridRef} className="overview-grid overview-grid-2">
        {teamRosters.map(({ team, roster }) => (
          <ShareableChart key={teamKey(team)} className="card team-share-card">
            <h4 className="card-title entity-inline-row">
              <TeamLogo name={team.name} size={20} />
              <span>{team.name}</span>
            </h4>
            <div className="team-share-pie-row">
              <SharePie title="DMG%" data={buildPlayerShareSlices(roster, 'dmgShare')} />
              <SharePie title="GOLD%" data={buildPlayerShareSlices(roster, 'goldShare')} />
            </div>
          </ShareableChart>
        ))}
      </div>
    </div>
  )
}
