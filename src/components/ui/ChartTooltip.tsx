import type { CSSProperties } from 'react'
import { CHART } from '../../theme/chartTheme'

export interface ChartTooltipRow {
  label: string
  value: string
}

export interface RechartsTooltipPayloadItem {
  value?: number | string
  name?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
  color?: string
}

export interface ChartTooltipContentProps {
  active?: boolean
  payload?: readonly RechartsTooltipPayloadItem[]
  label?: string | number
}

const WRAPPER_STYLE: CSSProperties = {
  backgroundColor: CHART.tooltip.backgroundColor,
  border: CHART.tooltip.border,
  borderRadius: 0,
  color: CHART.tooltip.color,
  fontFamily: CHART.fontFamily,
  fontSize: CHART.fontSize,
  padding: '10px 12px',
}

export function ChartTooltip({
  title,
  rows,
}: {
  title: string
  rows: ChartTooltipRow[]
}) {
  if (!rows.length) return null

  return (
    <div className="chart-tooltip" style={WRAPPER_STYLE}>
      <div className="chart-tooltip-name">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="chart-tooltip-row">
          <span className="chart-tooltip-key">{row.label}</span>
          <span className="chart-tooltip-val">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

export function makeChartTooltipContent(
  getTitle: (props: ChartTooltipContentProps) => string | undefined,
  getRows: (props: ChartTooltipContentProps) => ChartTooltipRow[],
) {
  return function ChartTooltipContent(props: ChartTooltipContentProps) {
    if (!props.active) return null
    const title = getTitle(props)
    if (!title) return null
    const rows = getRows(props)
    if (!rows.length) return null
    return <ChartTooltip title={title} rows={rows} />
  }
}
